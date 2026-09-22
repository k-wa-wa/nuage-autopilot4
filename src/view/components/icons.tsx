import type { ComponentChildren } from "preact";

interface IconProps {
  size?: number;
}

function Svg({ size, children }: { size: number; children: ComponentChildren }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PrIcon = ({ size = 12 }: IconProps) => (
  <Svg size={size}>
    <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
  </Svg>
);

export const WarnIcon = ({ size = 12 }: IconProps) => (
  <Svg size={size}>
    <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
  </Svg>
);

export const HistoryIcon = ({ size = 12 }: IconProps) => (
  <Svg size={size}>
    <path d="M8.5 4.5a.5.5 0 0 0-1 0v3.793l-2.146 2.147a.5.5 0 0 0 .708.708l2.5-2.5A.5.5 0 0 0 8.5 8.5V4.5z" />
    <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16z" />
  </Svg>
);

export const InfoIcon = ({ size = 14 }: IconProps) => (
  <svg
    role="img"
    aria-label="システム・API情報"
    viewBox="0 0 20 20"
    fill="currentColor"
    width={size}
    height={size}
  >
    <title>システム・API情報</title>
    <path
      fill-rule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clip-rule="evenodd"
    />
  </svg>
);

export const CloseIcon = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
  </Svg>
);

export const SparklesIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M7.53 1.282a.5.5 0 0 1 .94 0l.972 2.915a3.5 3.5 0 0 0 2.213 2.213l2.915.972a.5.5 0 0 1 0 .94l-2.915.972a3.5 3.5 0 0 0-2.213 2.213l-.972 2.915a.5.5 0 0 1-.94 0l-.972-2.915a3.5 3.5 0 0 0-2.213-2.213L.43 8.322a.5.5 0 0 1 0-.94l2.915-.972a3.5 3.5 0 0 0 2.213-2.213l.972-2.915Z" />
  </Svg>
);

export const PlusIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 12 }: IconProps) => (
  <Svg size={size}>
    <path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.939l2.513-2.512a.75.75 0 1 1 1.06 1.061l-3.043 3.043a.75.75 0 0 1-1.06 0L4.427 7.488a.75.75 0 0 1 0-1.061Z" />
  </Svg>
);

export const ArrowRightIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path
      fill-rule="evenodd"
      d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l2.97-2.97H2.75a.75.75 0 0 1 0-1.5h8.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"
      clip-rule="evenodd"
    />
  </Svg>
);

export const MarkdownIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7V8L5.5 9.9 4 8v3H2V5h2l1.5 2L7 5h2v6zm2.99.5L9.5 8H11V5h2v3h1.5l-2.51 3.5z" />
  </Svg>
);

export const ExternalLinkIcon = ({ size = 12 }: IconProps) => (
  <Svg size={size}>
    <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.75.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V3.56l-4.22 4.22a.75.75 0 0 1-1.06-1.06l4.22-4.22H11.25a.75.75 0 0 1-.75-.75z" />
  </Svg>
);
