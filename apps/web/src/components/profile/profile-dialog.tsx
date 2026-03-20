"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/app/providers/auth-provider";
import {
  useUpdateProfile,
  useUploadProfilePhoto,
  useRemoveProfilePhoto,
} from "@/hooks/use-user";
import { updateProfileSchema } from "@journiful/shared/schemas";
import type { UpdateProfileInput } from "@journiful/shared/schemas";
import {
  TIMEZONES,
  TIMEZONE_AUTO_DETECT,
  getDetectedTimezone,
  getTimezoneLabel,
} from "@/lib/constants";
import { formatPhoneNumber, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarSyncSection } from "./calendar-sync-section";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const updateProfile = useUpdateProfile();
  const uploadPhoto = useUploadProfilePhoto();
  const removePhoto = useRemoveProfilePhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const detectedTimezone = getDetectedTimezone();

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      displayName: "",
      timezone: null,
      temperatureUnit: undefined,
      handles: { venmo: "", instagram: "" },
    },
  });

  // Populate form once user data is available
  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName,
        timezone: user.timezone,
        temperatureUnit:
          (user.temperatureUnit as "celsius" | "fahrenheit") || "fahrenheit",
        handles: {
          venmo: user.handles?.venmo ?? "",
          instagram: user.handles?.instagram ?? "",
        },
      });
    }
  }, [user, form]);

  // Determine current timezone select value
  const timezoneValue = form.watch("timezone");
  const selectTimezoneValue =
    timezoneValue === null || timezoneValue === undefined
      ? TIMEZONE_AUTO_DETECT
      : timezoneValue;

  function onTimezoneChange(value: string) {
    if (value === TIMEZONE_AUTO_DETECT) {
      form.setValue("timezone", null, { shouldDirty: true });
    } else {
      form.setValue("timezone", value, { shouldDirty: true });
    }
  }

  async function onSubmit(data: UpdateProfileInput) {
    // Clean handles: remove empty strings, set to null if no handles
    const cleanHandles: Record<string, string> = {};
    if (data.handles) {
      for (const [platform, handle] of Object.entries(data.handles)) {
        const trimmed = handle.trim();
        if (trimmed) {
          cleanHandles[platform] = trimmed;
        }
      }
    }

    updateProfile.mutate(
      {
        displayName: data.displayName,
        timezone: data.timezone,
        temperatureUnit: data.temperatureUnit,
        handles: Object.keys(cleanHandles).length > 0 ? cleanHandles : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  function handlePhotoClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);

    uploadPhoto.mutate(file, {
      onSuccess: () => {
        // Clean up preview URL after successful upload
        URL.revokeObjectURL(objectUrl);
        setPhotoPreview(null);
      },
      onError: () => {
        // Revert preview on error
        URL.revokeObjectURL(objectUrl);
        setPhotoPreview(null);
      },
    });

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    removePhoto.mutate();
  }

  const currentPhotoUrl = photoPreview || user?.profilePhotoUrl;
  const isPhotoLoading = uploadPhoto.isPending || removePhoto.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Profile
          </SheetTitle>
          <SheetDescription>
            Manage your account details and preferences
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {loading ? (
            <div className="space-y-6 pb-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full shrink-0" />
                <Skeleton className="h-11 w-32 rounded-md" />
              </div>
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : user ? (
            <div className="space-y-6 pb-6">
              {/* Profile Photo Section */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <Avatar
                    className="size-20 text-xl"
                    data-testid="profile-avatar"
                  >
                    {currentPhotoUrl && (
                      <AvatarImage
                        src={getUploadUrl(currentPhotoUrl)}
                        alt={user.displayName}
                      />
                    )}
                    <AvatarFallback className="text-xl">
                      {getInitials(user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  {isPhotoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-full">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Upload profile photo"
                  data-testid="photo-file-input"
                />

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="px-3 rounded-md"
                    onClick={handlePhotoClick}
                    disabled={isPhotoLoading}
                    data-testid="upload-photo-button"
                  >
                    <Camera className="w-4 h-4 mr-1.5" />
                    {currentPhotoUrl ? "Change photo" : "Upload photo"}
                  </Button>
                  {currentPhotoUrl && !photoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-3 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleRemovePhoto}
                      disabled={isPhotoLoading}
                      data-testid="remove-photo-button"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Profile Form */}
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  {/* Display Name */}
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Display name
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="John Doe"
                            className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                            disabled={updateProfile.isPending}
                            autoComplete="nickname"
                            aria-required="true"
                            data-testid="display-name-input"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-sm text-muted-foreground">
                          This is how others will see you on the platform
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Phone Number (read-only) */}
                  <div className="space-y-2">
                    <label className="text-base font-semibold text-foreground">
                      Phone number
                    </label>
                    <Input
                      type="tel"
                      value={formatPhoneNumber(user.phoneNumber)}
                      readOnly
                      disabled
                      className="h-12 text-base border-input bg-muted cursor-not-allowed rounded-md"
                      data-testid="phone-number-input"
                    />
                    <p className="text-sm text-muted-foreground">
                      Phone number cannot be changed
                    </p>
                  </div>

                  {/* Timezone */}
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Timezone
                        </FormLabel>
                        <Select
                          onValueChange={onTimezoneChange}
                          value={selectTimezoneValue}
                          disabled={updateProfile.isPending}
                        >
                          <FormControl>
                            <SelectTrigger
                              ref={field.ref}
                              onBlur={field.onBlur}
                              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                              data-testid="timezone-select"
                            >
                              <SelectValue placeholder="Select your timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={TIMEZONE_AUTO_DETECT}>
                              Auto-detect ({getTimezoneLabel(detectedTimezone)})
                            </SelectItem>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-sm text-muted-foreground">
                          Used to show you times in your local timezone
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Temperature Unit */}
                  <FormField
                    control={form.control}
                    name="temperatureUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground">
                          Temperature unit
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "fahrenheit"}
                          disabled={updateProfile.isPending}
                        >
                          <FormControl>
                            <SelectTrigger
                              ref={field.ref}
                              onBlur={field.onBlur}
                              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                              data-testid="temperature-unit-select"
                            >
                              <SelectValue placeholder="Select temperature unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="celsius">°C Celsius</SelectItem>
                            <SelectItem value="fahrenheit">
                              °F Fahrenheit
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-sm text-muted-foreground">
                          Used for weather forecasts in your itinerary
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Appearance */}
                  <div className="space-y-2">
                    <label className="text-base font-semibold text-foreground">
                      Appearance
                    </label>
                    <Select onValueChange={setTheme} value={theme ?? "light"}>
                      <SelectTrigger
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                        data-testid="appearance-select"
                      >
                        <SelectValue placeholder="Select appearance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Choose how Journiful looks for you
                    </p>
                  </div>

                  <Separator />

                  {/* Social Handles */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold text-foreground">
                        Social handles
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Visible to other trip members
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="handles.venmo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground">
                            Venmo
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="@your-venmo"
                              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                              disabled={updateProfile.isPending}
                              data-testid="venmo-handle-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="handles.instagram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground">
                            Instagram
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="@your-instagram"
                              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
                              disabled={updateProfile.isPending}
                              data-testid="instagram-handle-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={updateProfile.isPending}
                    variant="gradient"
                    className="w-full h-12 rounded-md"
                    data-testid="save-profile-button"
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </form>
              </Form>

              <CalendarSyncSection />
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
