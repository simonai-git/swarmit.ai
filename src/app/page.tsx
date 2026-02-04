import KanbanBoard from '@/components/KanbanBoard';

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Ambient background effects - reduced on mobile for performance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] bg-blue-500/20 rounded-full blur-[80px] sm:blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-purple-500/20 rounded-full blur-[80px] sm:blur-[120px]" />
        <div className="hidden sm:block absolute top-[40%] right-[20%] w-[400px] h-[400px] bg-pink-500/10 rounded-full blur-[100px]" />
      </div>
      
      {/* Content */}
      <div className="relative z-10">
        <KanbanBoard />
      </div>
    </main>
  );
}
