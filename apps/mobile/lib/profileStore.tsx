import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PROFILE } from "@/mocks/profile";
import { applyDraft, type Profile, type ProfileDraft } from "@/lib/profile";

type ProfileValue = {
  profile: Profile;
  saveProfile: (draft: ProfileDraft) => void;
  /** The picture is uploaded there and then, not staged with the form.
   *  Null removes it — `DELETE /me/photo`. */
  savePhoto: (uri: string | null) => void;
};

const ProfileContext = createContext<ProfileValue | null>(null);

/**
 * In-memory profile. Stands in for the API so edits survive closing the
 * dialog — same call sites will hit `PUT /me` later.
 */
export function ProfileProvider({
  children,
  initial = PROFILE,
}: {
  children: ReactNode;
  initial?: Profile;
}) {
  const [profile, setProfile] = useState<Profile>(initial);

  const saveProfile = useCallback((draft: ProfileDraft) => {
    setProfile((current) => applyDraft(current, draft));
  }, []);

  const savePhoto = useCallback((uri: string | null) => {
    setProfile((current) => ({ ...current, profilePhotoUrl: uri }));
  }, []);

  const value = useMemo(
    () => ({ profile, saveProfile, savePhoto }),
    [profile, saveProfile, savePhoto],
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
