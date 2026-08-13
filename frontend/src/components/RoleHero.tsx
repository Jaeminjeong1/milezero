export function RoleHero({ tag }: { tag: string }) {
  return (
    <section className="hero-copy">
      <span className="hero-tag">{tag}</span>
      <h2>
        마지막 구간은 <em>현장 경험</em>이 안내할게요.
      </h2>
    </section>
  );
}
