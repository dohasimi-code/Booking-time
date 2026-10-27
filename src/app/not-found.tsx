import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-stone-600">This link doesn&apos;t lead anywhere.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-teal-700 px-5 py-2.5 font-medium text-white">
        Go to the booking page
      </Link>
    </div>
  );
}
