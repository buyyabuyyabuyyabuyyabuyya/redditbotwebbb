import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          flex min-h-[80px] w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100
          placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#7c6cff] focus:border-transparent
          disabled:cursor-not-allowed disabled:opacity-50 resize-none
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
