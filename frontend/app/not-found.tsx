import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="container-site flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <span className="text-7xl">🍽️</span>
      <h1 className="mt-6 text-h1 text-ink">This page is off the menu</h1>
      <p className="mt-3 max-w-md text-body">
        The page you were looking for doesn&apos;t exist or has moved. Let&apos;s get you back
        to something delicious.
      </p>
      <Button href="/" size="lg" className="mt-8">
        Back to home
      </Button>
    </main>
  );
}
