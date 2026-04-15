import Link from "next/link";

const MINDS = [
  {
    slug: "paul-graham",
    name: "Paul Graham",
    description:
      "230 essays on startups, programming, and ideas. How to start a startup, what to work on, and how to think.",
    years: "2001 – present",
    status: "live",
  },
  {
    slug: "buffett",
    name: "Warren Buffett",
    description:
      "41 Berkshire Hathaway shareholder letters (1977–2019). Moats, capital allocation, intrinsic value.",
    years: "1977 – 2019",
    status: "live",
  },
  {
    slug: "munger",
    name: "Charlie Munger",
    description:
      "Poor Charlie's Almanack, USC commencement speech, Daily Journal annual meetings.",
    years: "coming soon",
    status: "soon",
  },
  {
    slug: "damodaran",
    name: "Aswath Damodaran",
    description:
      "NYU Stern lecture notes, valuation textbooks, and two decades of blog posts.",
    years: "coming soon",
    status: "soon",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="border-b border-stone-200 bg-white px-6 py-20 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-stone-400">
          Investor Minds
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-stone-900 sm:text-5xl">
          The ideas behind the world&apos;s greatest investors — compiled and connected.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-500">
          Each site is a knowledge graph built from primary sources: letters,
          speeches, and books. Click a concept, follow the links, understand
          how the thinking connects.
        </p>
      </section>

      {/* Mind cards */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {MINDS.map((mind) => (
            <div
              key={mind.slug}
              className={`rounded-2xl border bg-white p-6 shadow-sm transition ${
                mind.status === "live"
                  ? "hover:shadow-md border-stone-200"
                  : "opacity-60 border-stone-100"
              }`}
            >
              {mind.status === "live" ? (
                <Link href={`/${mind.slug}`} className="block">
                  <MindCardContent mind={mind} />
                </Link>
              ) : (
                <MindCardContent mind={mind} />
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-stone-200 px-6 py-8 text-center text-sm text-stone-400">
        Built on primary sources. Concepts compiled from publicly available
        letters, speeches, and books.
      </footer>
    </main>
  );
}

function MindCardContent({
  mind,
}: {
  mind: { name: string; description: string; years: string; status: string };
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">{mind.name}</h2>
        {mind.status === "live" ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Live
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
            Soon
          </span>
        )}
      </div>
      <p className="text-sm text-stone-500">{mind.description}</p>
      <p className="mt-3 text-xs font-medium text-stone-400">{mind.years}</p>
    </>
  );
}
