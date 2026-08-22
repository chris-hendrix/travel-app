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
    <div
      data-slot="phone-input"
      className={cn(
        "flex items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow,border-color] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px] has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-destructive/20",
        "h-12 px-1 disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
    >
      <RPNPhoneInput
        international
        defaultCountry={defaultCountry}
        value={(value || "") as Value}
        onChange={(val) => onChange?.(val as string | undefined)}
        disabled={disabled}
        flags={flags}
        countrySelectComponent={CountrySelect}
        inputComponent={InputField}
        className="flex w-full flex-1 items-center gap-0"
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
    <div className="relative flex items-center shrink-0 pl-2">
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
      <div className="flex items-center gap-1 pr-2 border-r border-input mr-2">
        {Icon && value ? <Icon country={value} label="" /> : null}
        <ChevronDownIcon className="text-muted-foreground size-3.5 opacity-60" />
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
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex-1 bg-transparent px-2 py-1 text-base outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm w-full min-w-0",
        className,
      )}
      {...rest}
    />
  );
}

export { PhoneInput };
export type { PhoneInputProps };
