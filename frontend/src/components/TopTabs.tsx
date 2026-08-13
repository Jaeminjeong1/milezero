export type DeliveryTab = "reporter" | "receiver";

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
        aria-selected={active === "reporter"}
        onClick={() => onChange("reporter")}
      >
        등록하는 기사
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "receiver"}
        onClick={() => onChange("receiver")}
      >
        도움 받는 기사
      </button>
    </nav>
  );
}
