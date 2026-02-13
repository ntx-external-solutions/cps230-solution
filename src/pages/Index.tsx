const Index = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-fade-in space-y-6">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Your Blank Canvas
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              A beautifully crafted starting point for your next project. 
              Built with modern tools and ready to be shaped into something amazing.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-muted-foreground">React 18</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-muted-foreground">TypeScript</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-muted-foreground">Tailwind CSS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Index;
