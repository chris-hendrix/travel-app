"use client";

import * as React from "react";
import RPNPhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import type { Country, Value } from "react-phone-number-input";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type PhoneInputProps = {
  value?: string;
  onChange?: (value?: string) => void;
  onBlur?: React.FocusEventHandler<HTMLElement>;
  name?: string;
  defaultCountry?: Country;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  "aria-describedby"?: string | undefined;
  id?: string;
};

function PhoneInput({
  className,
  value,
  onChange,
  defaultCountry = "US",
  disabled = false,
  ...props
}: PhoneInputProps) {
  return (
    <div data-slot="phone-input" className={cn("flex", className)}>
      <RPNPhoneInput
        international
        defaultCountry={defaultCountry}
        value={(value || "") as Value}
        onChange={(val) => onChange?.(val as string | undefined)}
        disabled={disabled}
        flags={flags}
        countrySelectComponent={CountrySelect}
        inputComponent={InputField}
        className="flex w-full items-center"
        {...props}
      />
    </div>
  );
}

type CountrySelectProps = {
  value?: Country;
  onChange?: (country: Country) => void;
  options?: Array<{ value?: Country; label: string }>;
  disabled?: boolean;
  iconComponent?: React.ComponentType<{ country?: Country; label: string }>;
};

function CountrySelect({
  value,
  onChange,
  options,
  disabled,
  iconComponent: Icon,
}: CountrySelectProps) {
  return (
    <div className="relative flex items-center">
      <select
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value as Country)}
        disabled={disabled}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label="Country"
      >
        {options?.map((option) => (
          <option key={option.value || "intl"} value={option.value || ""}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 pr-2">
        {Icon && value ? <Icon country={value} label="" /> : null}
        <ChevronDownIcon className="text-muted-foreground size-4 opacity-50" />
      </div>
    </div>
  );
}

function InputField(props: React.ComponentProps<"input">) {
  const { className, ...rest } = props;
  return (
    <input
      type="tel"
      autoComplete="tel"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className,
      )}
      {...rest}
    />
  );
}

export { PhoneInput };
export type { PhoneInputProps };
