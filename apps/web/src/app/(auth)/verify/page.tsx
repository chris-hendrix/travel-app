"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyCodeSchema, type VerifyCodeInput } from "@journiful/shared";
import { useAuth } from "@/app/providers/auth-provider";
import { formatPhoneNumber } from "@/lib/format";
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

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneNumber = searchParams.get("phone") || "";
  const { verify, login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<VerifyCodeInput>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      phoneNumber,
      code: "",
    },
  });

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  async function onSubmit(data: VerifyCodeInput) {
    try {
      setIsSubmitting(true);
      const result = await verify(data.phoneNumber, data.code);

      if (result.requiresProfile) {
        router.push("/complete-profile");
      } else {
        router.push("/trips");
      }
    } catch (error) {
      form.setError("code", {
        message: error instanceof Error ? error.message : "Verification failed",
      });
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    try {
      setIsResending(true);
      setResendSuccess(null);
      await login(phoneNumber);
      setResendSuccess("A new code has been sent to your phone");
      form.setValue("code", "");
    } catch (error) {
      form.setError("code", {
        message:
          error instanceof Error ? error.message : "Failed to resend code",
      });
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="relative bg-card rounded-md shadow-2xl p-8 lg:p-12 border border-border/50 linen-texture overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-700">
        <div className="space-y-6 relative pt-2">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground tracking-tight font-playfair">
              Verify your number
            </h1>
            <p className="text-muted-foreground">
              Enter the 6-digit code sent to{" "}
              <span className="font-semibold text-foreground">
                {formatPhoneNumber(phoneNumber)}
              </span>
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-foreground">
                      Verification code
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="000000"
                        className="h-14 text-2xl font-mono text-center tracking-widest border-input focus-visible:border-ring focus-visible:ring-ring"
                        disabled={isSubmitting}
                        maxLength={6}
                        autoComplete="one-time-code"
                        aria-required="true"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setResendSuccess(null);
                        }}
                        ref={(e) => {
                          field.ref(e);
                          inputRef.current = e;
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Check your SMS messages for the code
                    </FormDescription>
                    <FormMessage />
                    {resendSuccess && (
                      <p className="text-sm text-success">{resendSuccess}</p>
                    )}
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isSubmitting}
                variant="gradient"
                className="w-full h-12 rounded-md"
              >
                {isSubmitting ? "Verifying..." : "Verify"}
              </Button>
            </form>
          </Form>

          <div className="flex items-center justify-between text-sm">
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Change number
            </Link>
            <Button
              type="button"
              variant="link"
              onClick={handleResendCode}
              disabled={isResending}
              className="text-primary hover:text-primary/80 font-medium p-0 h-auto"
            >
              {isResending ? "Sending..." : "Resend code"}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Didn&apos;t receive the code? Wait a moment and try resending
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl shadow-2xl p-8 lg:p-12 border border-border/50 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-5 w-72" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-12 w-full rounded-md" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      }
    >
      <VerifyPageContent />
    </Suspense>
  );
}
