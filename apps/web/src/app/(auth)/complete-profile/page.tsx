"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import {
  completeProfileSchema,
  type CompleteProfileInput,
} from "@journiful/shared";
import { useAuth } from "@/app/providers/auth-provider";
import { useUploadProfilePhoto } from "@/hooks/use-user";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TIMEZONES,
  TIMEZONE_AUTO_DETECT,
  getDetectedTimezone,
  getTimezoneLabel,
} from "@/lib/constants";
import { getInitials } from "@/lib/format";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export default function CompleteProfilePage() {
  const router = useRouter();
  const { completeProfile } = useAuth();
  const uploadPhoto = useUploadProfilePhoto();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const detectedTimezone = getDetectedTimezone();

  const form = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      displayName: "",
      timezone: null,
    },
  });

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

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
    setSelectedFile(file);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setSelectedFile(null);
  }

  async function onSubmit(data: CompleteProfileInput) {
    try {
      setIsSubmitting(true);
      const payload: { displayName: string; timezone?: string } = {
        displayName: data.displayName,
      };
      if (data.timezone) {
        payload.timezone = data.timezone;
      }
      await completeProfile(payload);

      if (selectedFile) {
        try {
          await uploadPhoto.mutateAsync(selectedFile);
        } catch {
          // Photo upload failure should not block onboarding
        }
      }

      router.push("/trips");
    } catch (error) {
      form.setError("displayName", {
        message:
          error instanceof Error && error.message
            ? error.message
            : "Failed to complete profile",
      });
      setIsSubmitting(false);
    }
  }

  const displayName = form.watch("displayName");

  return (
    <div className="w-full max-w-md">
      <div className="bg-card rounded-3xl shadow-2xl p-8 lg:p-12 border border-border/50 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-700">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
              Complete your profile
            </h1>
            <p className="text-muted-foreground">
              Tell us a bit about yourself to get started
            </p>
          </div>

          {/* Photo Upload Section */}
          <div className="flex flex-col items-center gap-3">
            <Avatar className="size-20 text-xl" data-testid="profile-avatar">
              {photoPreview && (
                <AvatarImage src={photoPreview} alt="Profile photo preview" />
              )}
              <AvatarFallback className="text-xl">
                {displayName ? getInitials(displayName) : "?"}
              </AvatarFallback>
            </Avatar>

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
                disabled={isSubmitting}
                data-testid="upload-photo-button"
              >
                <Camera className="w-4 h-4 mr-1.5" />
                {photoPreview ? "Change photo" : "Upload photo"}
              </Button>
              {photoPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-3 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleRemovePhoto}
                  disabled={isSubmitting}
                  data-testid="remove-photo-button"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Remove
                </Button>
              )}
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-foreground">
                      Display name
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="John Doe"
                        className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring"
                        disabled={isSubmitting}
                        autoComplete="nickname"
                        aria-required="true"
                        {...field}
                        ref={(e) => {
                          field.ref(e);
                          inputRef.current = e;
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      This is how others will see you on the platform
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-foreground">
                      Timezone
                    </FormLabel>
                    <Select
                      onValueChange={onTimezoneChange}
                      value={selectTimezoneValue}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring"
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
                    <FormDescription className="text-xs text-muted-foreground">
                      Used to show you times in your local timezone
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isSubmitting}
                variant="gradient"
                className="w-full h-12 rounded-md"
              >
                {isSubmitting ? "Saving..." : "Complete profile"}
              </Button>
            </form>
          </Form>

          <p className="text-xs text-center text-muted-foreground">
            You can update this information later in your settings
          </p>
        </div>
      </div>
    </div>
  );
}
