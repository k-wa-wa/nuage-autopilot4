import type { FC } from "hono/jsx";

export interface BannerProps {
  degraded?: string[];
}

export const BannerComponent: FC<BannerProps> = ({ degraded = [] }) => {
  if (!degraded.length) return null;

  return (
    <div class="banner">
      <span>⚠️ {degraded.join(" / ")}</span>
      <span class="banner-tap-hint">障害詳細を見る &rarr;</span>
    </div>
  );
};
