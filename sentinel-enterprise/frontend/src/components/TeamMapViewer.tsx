import React, { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

export function TeamMapViewer() {
  const [diagram, setDiagram] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  const fetchDiagram = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3000/api/team-map');
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      const data = await response.json();
      setDiagram(data.diagram);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDiagram();
  }, []);

  // --- THIS IS THE UPDATED BLOCK ---
  useEffect(() => {
    if (diagram && mermaidRef.current) {
      // 1. Aggressively strip out Markdown backticks if the AI included them
      const cleanDiagram = diagram
        .replace(/```mermaid/gi, '')
        .replace(/```/g, '')
        .trim();

      console.log("Attempting to render clean diagram:", cleanDiagram);

      mermaidRef.current.removeAttribute('data-processed');

      // 2. Generate a perfectly unique ID so React strict-mode doesn't crash Mermaid
      const uniqueId = `mermaid-graph-${Date.now()}`;

      mermaid.render(uniqueId, cleanDiagram).then((result) => {
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = result.svg;
        }
      }).catch(err => {
        console.error('Mermaid render error:', err);
        setError(`Failed to render diagram. Check console for details.`);
      });
    }
  }, [diagram]);
  // --- END OF UPDATED BLOCK ---

  return (
    <div className="w-full bg-muted/20 border border-border rounded-lg p-6 relative mt-8">
      <div className="absolute -top-3 left-4 px-2 bg-background border border-border rounded text-[10px] font-mono uppercase tracking-tight text-foreground/70">
        Live_Architecture_Map
      </div>

      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          Dynamic System Architecture Flow
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchDiagram()}
          disabled={loading}
          className="h-7 text-[10px] px-2 font-mono uppercase tracking-widest border-border"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1.5" />
          )}
          Refresh Map
        </Button>
      </div>

      {error && (
        <div className="text-red-400 text-xs mb-4">
          Error: {error}
        </div>
      )}

      <div className="flex justify-center items-center min-h-[300px] overflow-x-auto border border-dashed border-border/50 rounded-md bg-background/50 p-4">
        {loading && !diagram ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-[10px] uppercase font-bold tracking-widest animate-pulse">Synthesizing Blueprint...</span>
          </div>
        ) : diagram ? (
          <div ref={mermaidRef} className="mermaid w-full flex justify-center" />
        ) : (
          <div className="text-xs text-muted-foreground font-mono uppercase">No map generated yet</div>
        )}
      </div>
    </div>
  );
}