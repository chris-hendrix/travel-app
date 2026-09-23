import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authKeys, meOptions } from "@/lib/queries/auth";
import {
  removePhotoOptions,
  updateProfile,
  uploadPhotoOptions,
} from "@/lib/queries/profile";
import { applyDraft, type Profile, type ProfileDraft } from "@/lib/profile";

type ProfileValue = {
  /** Null while the me read is pending or failed — the screen gates
   *  on `status`, never on this alone. */
  profile: Profile | null;
  saveProfile: (draft: ProfileDraft) => Promise<void>;
  /** The picture is uploaded there and then, not staged with the form.
   *  A URI uploads (`POST /users/me/photo`); null removes it
   *  (`DELETE /users/me/photo`). Optimistic with rollback — the
   *  trips cover flow shape. */
  savePhoto: (uri: string | null) => Promise<void>;
  /**
   * The me read's state, for the screen gate. Explicit rather than
   * Suspense on purpose: the provider sits above the Suspense
   * boundary in `app/_layout.tsx` (same constraint as the
   * notifications store), so a suspending read would have no
   * boundary to land on. The screen owns the loading/error copy off
   * these.
   */
  status: "pending" | "error" | "success";
  error: unknown;
  retry: () => void;
};

const ProfileContext = createContext<ProfileValue | null>(null);

/**
 * The read is `meOptions()` (`GET /auth/me` — there is no
 * `GET /users/me`): the same key the auth store restores through, so
 * the profile screen and the cold start can never disagree. The write
 * goes through `PUT /users/me` with optimistic paint and rollback —
 * the Task 4 trips flow shape.
 *
 * The key shape is unchanged, so the profile screen keeps the
 * accessors it already calls; only the engine is server instead of
 * memory.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery(meOptions());
  const profile = useMemo(
    () => meQuery.data ?? null,
    [meQuery.data],
  );

  const retry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: authKeys.me() });
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationKey: ["profile", "update"],
    mutationFn: (draft: ProfileDraft) => updateProfile(draft),
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      const previous = queryClient.getQueryData<Profile>(authKeys.me());
      // The update endpoint answers the full user row, but the paint
      // cannot wait for it: fold the draft over the cached profile
      // now (`applyDraft` — the same rule the form previews with),
      // keep the server row on success, restore on failure.
      if (previous) {
        queryClient.setQueryData<Profile>(
          authKeys.me(),
          applyDraft(previous, draft),
        );
      }
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Profile>(authKeys.me(), updated);
    },
    onError: (_error, _draft, context) => {
      if (context?.previous) {
        queryClient.setQueryData(authKeys.me(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });

  const saveProfile = useCallback(
    (draft: ProfileDraft) => updateMutation.mutateAsync(draft).then(() => {}),
    [updateMutation],
  );

  // The optimistic image is the picker's local URI (the screen
  // renders it while the upload flies); `onSuccess` swaps in the
  // server URL. Removal paints `null`, which the screen already
  // renders as initials.
  const uploadPhotoMutation = useMutation({
    ...uploadPhotoOptions(),
    onMutate: async ({ uri }: { uri: string }) => {
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      const previous = queryClient.getQueryData<Profile>(authKeys.me());
      if (previous) {
        queryClient.setQueryData<Profile>(authKeys.me(), {
          ...previous,
          profilePhotoUrl: uri,
        });
      }
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Profile>(authKeys.me(), updated);
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(authKeys.me(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
  const removePhotoMutation = useMutation({
    ...removePhotoOptions(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      const previous = queryClient.getQueryData<Profile>(authKeys.me());
      if (previous) {
        queryClient.setQueryData<Profile>(authKeys.me(), {
          ...previous,
          profilePhotoUrl: null,
        });
      }
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Profile>(authKeys.me(), updated);
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(authKeys.me(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });

  const savePhoto = useCallback(
    (uri: string | null) =>
      uri === null
        ? removePhotoMutation.mutateAsync().then(() => {})
        : uploadPhotoMutation.mutateAsync({ uri }).then(() => {}),
    [uploadPhotoMutation, removePhotoMutation],
  );

  const value = useMemo(
    () => ({
      profile,
      saveProfile,
      savePhoto,
      status: meQuery.status,
      error: meQuery.error,
      retry,
    }),
    [profile, saveProfile, savePhoto, meQuery.status, meQuery.error, retry],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used inside ProfileProvider");
  return value;
}
