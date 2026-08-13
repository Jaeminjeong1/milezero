export type DeliveryTab = "today" | "next";

export function TopTabs({
  active,
  onChange,
}: {
  active: DeliveryTab;
  onChange(tab: DeliveryTab): void;
}) {
  return (
    <nav className="top-tabs" role="tablist" aria-label="배송 화면">
      <button
        type="button"
        role="tab"
        aria-selected={active === "today"}
        onClick={() => onChange("today")}
      >
        오늘 배송
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "next"}
        onClick={() => onChange("next")}
      >
        다음 배송
      </button>
    </nav>
  );
}
