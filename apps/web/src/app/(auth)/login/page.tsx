"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { requestCodeSchema, type RequestCodeInput } from "@journiful/shared";
import { useAuth } from "@/app/providers/auth-provider";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const phoneHint = searchParams.get("phone");
  const safeRedirect = redirect?.startsWith("/") ? redirect : null;
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RequestCodeInput>({
    resolver: zodResolver(requestCodeSchema),
    defaultValues: {
      phoneNumber: phoneHint || "",
      smsConsent: false,
    },
  });

  async function onSubmit(data: RequestCodeInput) {
    try {
      setIsSubmitting(true);
      await login(data.phoneNumber, data.smsConsent);
      const verifyUrl = `/verify?phone=${encodeURIComponent(data.phoneNumber)}&smsConsent=true${safeRedirect ? `&redirect=${encodeURIComponent(safeRedirect)}` : ""}`;
      router.push(verifyUrl);
    } catch (error) {
      form.setError("phoneNumber", {
        message: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="relative bg-card rounded-md shadow-2xl p-8 lg:p-12 border border-border/50 linen-texture overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-700">
        {/* Airmail stripe top */}
        <div className="space-y-6 relative pt-2">
          <div className="space-y-2">
            <p className="text-sm text-accent font-accent uppercase tracking-widest">
              Par Avion
            </p>
            <h1 className="text-3xl font-semibold text-foreground tracking-tight font-playfair">
              Get started
            </h1>
            <p className="text-muted-foreground">
              Enter your phone number to sign in or create an account
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-foreground">
                      Phone number
                    </FormLabel>
                    <FormControl>
                      <PhoneInput
                        placeholder="(555) 123-4567"
                        className="h-12 text-base"
                        defaultCountry="US"
                        disabled={isSubmitting}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        aria-required="true"
                      />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      We&apos;ll send you a verification code via SMS
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-start gap-2">
                <Checkbox
                  id="smsConsent"
                  checked={form.watch("smsConsent")}
                  onCheckedChange={(checked) =>
                    form.setValue("smsConsent", checked === true)
                  }
                  disabled={isSubmitting}
                />
                <label
                  htmlFor="smsConsent"
                  className="text-xs text-muted-foreground leading-relaxed"
                >
                  I agree to receive text messages from Journiful, including
                  trip updates, event reminders, and verification codes. Msg
                  frequency varies. Msg &amp; data rates may apply. Reply STOP
                  to opt out. Consent is not required to use Journiful.{" "}
                  <Link
                    href="/sms-terms"
                    className="text-primary underline hover:text-primary/80"
                  >
                    SMS Terms
                  </Link>{" "}
                  &amp;{" "}
                  <Link
                    href="/privacy"
                    className="text-primary underline hover:text-primary/80"
                  >
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !form.watch("smsConsent")}
                variant="gradient"
                className="w-full h-12"
              >
                {isSubmitting ? "Sending..." : "Continue"}
              </Button>
            </form>
          </Form>

          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="text-primary underline hover:text-primary/80"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-primary underline hover:text-primary/80"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md">
          <div className="bg-card rounded-md shadow-2xl p-8 lg:p-12 border border-border/50 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-5 w-72" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
