import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import JsonLd from '@/components/seo/JsonLd';
import { organizationAndWebsite } from '@/lib/json-ld';

export default function PublicLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return (
    <>
      <JsonLd data={organizationAndWebsite(locale)} />
      <Navbar />
      <main id="main-content" className="min-h-screen pt-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
