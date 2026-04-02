import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-btn transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-forest text-cream hover:bg-forest-mid',
    ghost: 'bg-transparent border border-border text-forest hover:bg-cream-dark',
    danger: 'bg-red text-white hover:bg-red/90',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-[12px]',
    md: 'px-4 py-2 text-[13px]',
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
