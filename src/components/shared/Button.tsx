import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center gap-1.5 rounded-btn font-bold transition-colors cursor-pointer ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-forest text-paper hover:bg-forest-mid',
    // A ghost button is a card with a rule around it, so it sits in the paper rather than on it.
    ghost: 'bg-white border border-border text-forest hover:border-sage',
    danger: 'bg-red text-paper hover:bg-red-text',
  };

  const sizes = {
    sm: 'px-3.5 py-1.5 text-[12.5px]',
    md: 'px-4 py-2 text-[13px]',
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
