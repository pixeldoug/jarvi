import React from 'react';

export interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = "w-6 h-6", 
  size = 24 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 59 61" 
      className={className}
      fill="none"
    >
      <g filter="url(#filter0_dd_49_442)">
        <path 
          d="M32.6914 4C36.0274 4.8459 39.1211 6.48796 41.6934 8.77734C43.5792 10.1361 45.1006 11.9888 46.0527 14.1699C46.177 14.389 46.2969 14.6114 46.4141 14.8359C47.6236 14.8528 48.8455 14.6123 49.9932 14.0967C50.0722 15.8924 49.3932 17.6838 48.0547 18.9824C51.1612 30.0667 44.9166 41.6885 33.8564 45.1582C24.1629 48.199 13.9272 43.9876 9 35.5811C10.3719 35.3656 11.7463 35.0473 13.1113 34.6191C14.6984 34.1212 16.2095 33.4943 17.6387 32.7568C17.0244 32.496 16.4259 32.1726 15.8535 31.7822C11.8197 29.0309 10.3624 23.9162 12.0654 19.5537C12.5548 20.0064 13.084 20.4295 13.6514 20.8164C16.0432 22.4475 18.7704 23.2093 21.4609 23.1768C21.2305 22.4027 21.0671 21.5964 20.9814 20.7637C20.2405 13.5573 25.4821 7.11512 32.6885 6.37402C32.7585 6.36683 32.8286 6.36251 32.8984 6.35645C32.8623 5.57324 32.7945 4.78685 32.6914 4Z" 
          fill="currentColor"
        />
      </g>
      <ellipse 
        cx="38.4933" 
        cy="14.6815" 
        rx="1.64498" 
        ry="3.03688" 
        transform="rotate(-30 38.4933 14.6815)" 
        fill="white"
      />
      <defs>
        <filter id="filter0_dd_49_442" x="0.125797" y="0.450319" width="58.7479" height="59.8931" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="1.77484"/>
          <feGaussianBlur stdDeviation="1.33113"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0.0784314 0 0 0 0 0.0784314 0 0 0 0 0.0784314 0 0 0 0.17 0"/>
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_49_442"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="5.32452"/>
          <feGaussianBlur stdDeviation="4.4371"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.07 0"/>
          <feBlend mode="normal" in2="effect1_dropShadow_49_442" result="effect2_dropShadow_49_442"/>
          <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_49_442" result="shape"/>
        </filter>
      </defs>
    </svg>
  );
};
