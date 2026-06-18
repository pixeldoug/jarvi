interface CurveDividerProps {
  className?: string;
}

export function CurveDivider({ className }: CurveDividerProps) {
  return (
    <svg
      className={className}
      preserveAspectRatio="none"
      viewBox="0 0 1280 64.0001"
      fill="none"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1280 0C666.997 48.1538 171.249 20.0641 0 0V64.0001H1280V0Z"
        fill="#fff"
      />
    </svg>
  );
}
