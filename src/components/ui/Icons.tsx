import React from 'react';

interface IconProps {
  className?: string;
  tooltip?: string;
}

export const InfoCircleIcon: React.FC<IconProps> = ({ className, tooltip }) => {
  return (
    <div className="relative group">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={className}
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 4a1 1 0 100 2 1 1 0 000-2zm-1 4a1 1 0 112 0v6a1 1 0 11-2 0v-6z"
          clipRule="evenodd"
        />
      </svg>
      {tooltip && (
        <div className="absolute z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded p-2 w-48 -right-20 -top-2 transform -translate-y-full">
          {tooltip}
        </div>
      )}
    </div>
  );
};
