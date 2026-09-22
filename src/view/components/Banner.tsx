export interface BannerProps {
  degraded: string[];
  offline: boolean;
  onOpenDetail: () => void;
}

export function Banner({ degraded, offline, onOpenDetail }: BannerProps) {
  if (offline) {
    return <div class="banner banner-static">autopilot に接続できません</div>;
  }
  if (!degraded.length) return null;

  return (
    <button type="button" class="banner" onClick={onOpenDetail}>
      <span>⚠️ {degraded.join(" / ")}</span>
      <span class="banner-tap-hint">障害詳細を見る &rarr;</span>
    </button>
  );
}
