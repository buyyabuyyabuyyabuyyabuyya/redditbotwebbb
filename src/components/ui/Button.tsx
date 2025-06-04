import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  // Base classes
  const baseClasses =
    'relative inline-flex items-center justify-center rounded-md shadow-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900';

  // Size classes
  const sizeClasses = {
    small: 'px-3 py-1.5 text-xs',
    medium: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base',
  };

  // Variant classes
  const variantClasses = {
    primary:
      'bg-indigo-600 hover:bg-indigo-700 text-white border border-transparent focus:ring-indigo-500',
    secondary:
      'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 focus:ring-gray-500',
    danger:
      'bg-red-600 hover:bg-red-700 text-white border border-transparent focus:ring-red-500',
    success:
      'bg-green-600 hover:bg-green-700 text-white border border-transparent focus:ring-green-500',
    warning:
      'bg-amber-500 hover:bg-amber-600 text-white border border-transparent focus:ring-amber-500',
  };

  // Width classes
  const widthClasses = fullWidth ? 'w-full' : '';

  // Disabled state
  const disabledClasses = props.disabled ? 'opacity-60 cursor-not-allowed' : '';

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClasses} ${disabledClasses} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </span>
      )}
      <span className={`${isLoading ? 'opacity-0' : ''}`}>{children}</span>
    </button>
  );
}

// UI ripple effect button - inspiration from uiverse.io
export function RippleButton({
  children,
  variant = 'primary',
  size = 'medium',
  className = '',
  ...props
}: ButtonProps) {
  // Base classes
  const baseClasses =
    'group relative inline-flex overflow-hidden rounded-lg shadow-md focus:outline-none';

  // Size classes
  const sizeClasses = {
    small: 'px-3 py-1.5 text-xs',
    medium: 'px-5 py-2.5 text-sm',
    large: 'px-7 py-3.5 text-base',
  };

  // Variant classes
  const variantClasses = {
    primary: 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white',
    secondary: 'bg-gradient-to-br from-gray-700 to-gray-800 text-white',
    danger: 'bg-gradient-to-br from-red-500 to-rose-600 text-white',
    success: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white',
    warning: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
  };

  // Width classes
  const widthClasses = props.fullWidth ? 'w-full' : '';

  // Disabled state
  const disabledClasses = props.disabled ? 'opacity-60 cursor-not-allowed' : '';

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClasses} ${disabledClasses} ${className}`}
      {...props}
    >
      <span className="relative z-10 font-semibold">{children}</span>
      <span className="absolute inset-0 translate-y-[100%] bg-white/25 transition-transform duration-300 ease-out group-hover:translate-y-[0%] group-hover:mix-blend-overlay"></span>
      <span className="absolute inset-0 -translate-y-[100%] bg-white/10 transition-transform duration-300 ease-out group-hover:translate-y-[0%] group-hover:mix-blend-overlay"></span>
    </button>
  );
}

// UI 3D button - inspiration from uiverse.io
export function Button3D({
  children,
  variant = 'primary',
  size = 'medium',
  className = '',
  ...props
}: ButtonProps) {
  // Color mapping
  const colorMap = {
    primary: {
      background: 'bg-indigo-600',
      shadow: 'shadow-indigo-800',
      active: 'active:bg-indigo-700',
    },
    secondary: {
      background: 'bg-gray-600',
      shadow: 'shadow-gray-800',
      active: 'active:bg-gray-700',
    },
    danger: {
      background: 'bg-red-600',
      shadow: 'shadow-red-800',
      active: 'active:bg-red-700',
    },
    success: {
      background: 'bg-green-600',
      shadow: 'shadow-green-800',
      active: 'active:bg-green-700',
    },
    warning: {
      background: 'bg-amber-500',
      shadow: 'shadow-amber-700',
      active: 'active:bg-amber-600',
    },
  };

  // Size classes
  const sizeClasses = {
    small: 'px-3 py-1.5 text-xs',
    medium: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base',
  };

  // Width classes
  const widthClasses = props.fullWidth ? 'w-full' : '';

  return (
    <button
      className={`
        relative font-semibold text-white ${colorMap[variant].background} 
        rounded-md ${sizeClasses[size]} ${widthClasses}
        transform-gpu translate-y-0 transition-all duration-150
        shadow-[0_4px_0_0] ${colorMap[variant].shadow}
        hover:-translate-y-0.5 hover:shadow-[0_6px_0_0] 
        active:translate-y-1 active:shadow-[0_0px_0_0] ${colorMap[variant].active}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
