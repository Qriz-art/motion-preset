import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PresetExplorer from "@/components/PresetExplorer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <PresetExplorer />
      </main>
      <Footer />
    </>
  );
}
