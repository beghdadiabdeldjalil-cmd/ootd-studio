"use client";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, Category } from "@/utils/outfit.functions";

// Canvas dimensions (2:3 Pinterest ratio)
const W = 600;
const H = 900;

const PASTEL_BACKGROUNDS = [
  "#FFF5EE", "#FDEBEB", "#EDF5ED", "#EBF3FD",
  "#FDFAEB", "#F5EEFF", "#FDF3EB", "#EBFAF7",
  "#FDF8F3", "#F3F8FD",
];

// Initial placement for each category
const INITIAL_PLACEMENT: Record<Category, {
  left: number; top: number; scaleX: number; scaleY: number; angle: number
}> = {
  dress:      { left: W * 0.50, top: H * 0.42, scaleX: 0.45, scaleY: 0.45, angle: 0 },
  bag:        { left: W * 0.18, top: H * 0.55, scaleX: 0.22, scaleY: 0.22, angle: -5 },
  sunglasses: { left: W * 0.18, top: H * 0.20, scaleX: 0.20, scaleY: 0.20, angle: -8 },
  hat:        { left: W * 0.82, top: H * 0.20, scaleX: 0.22, scaleY: 0.22, angle: 8 },
  bracelet:   { left: W * 0.82, top: H * 0.55, scaleX: 0.18, scaleY: 0.18, angle: 5 },
  sandals:    { left: W * 0.50, top: H * 0.85, scaleX: 0.30, scaleY: 0.30, angle: 0 },
};

interface CollageEditorProps {
  result: AnalysisResult;
  onExport?: (dataUrl: string) => void;
}

export default function CollageEditor({ result, onExport }: CollageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const deleteImgRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [bgColor, setBgColor] = useState(
    PASTEL_BACKGROUNDS[Math.floor(Math.random() * PASTEL_BACKGROUNDS.length)]
  );

  useEffect(() => {
    if (!canvasRef.current) return;

    let canvas: any;

    (async () => {
      const fabric = await import("fabric");

      canvas = new fabric.Canvas(canvasRef.current!, {
        width: W,
        height: H,
        backgroundColor: bgColor,
        selection: true,
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      // Prepare delete icon image once
      const deleteIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23ff4444'/%3E%3Cpath d='M8 8l8 8M16 8l-8 8' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
      const deleteImg = document.createElement("img");
      deleteImg.src = deleteIcon;
      deleteImgRef.current = deleteImg;

      // Helper: add delete control to a FabricImage instance
      // In Fabric.js v7, controls are per-instance (via createControls()), not on the prototype
      const addDeleteControl = (img: any) => {
        if (!img.controls) return;
        img.controls.deleteControl = new fabric.Control({
          x: 0.5,
          y: -0.5,
          offsetY: -16,
          offsetX: 16,
          cursorStyle: "pointer",
          mouseUpHandler: (_e: any, transform: any) => {
            canvas.remove(transform.target);
            canvas.requestRenderAll();
            return true;
          },
          render: (ctx: CanvasRenderingContext2D, left: number, top: number) => {
            const size = 24;
            ctx.save();
            ctx.translate(left, top);
            ctx.drawImage(deleteImg, -size / 2, -size / 2, size, size);
            ctx.restore();
          },
        });
      };

      // Build items list: anchor + accessories
      const items: Array<{
        category: Category;
        image_url: string | null | undefined;
        name: string;
      }> = [
        {
          category: (result.dress.category as Category) || "dress",
          image_url: result.dress.image_url,
          name: result.dress.title,
        },
        ...result.accessories.map((a) => ({
          category: a.category,
          image_url: a.image_url,
          name: a.name,
        })),
      ];

      const itemsWithImages = items.filter((i) => i.image_url);
      setTotalCount(itemsWithImages.length);
      setLoading(itemsWithImages.length > 0);

      let loaded = 0;

      itemsWithImages.forEach((item) => {
        const placement = INITIAL_PLACEMENT[item.category] || INITIAL_PLACEMENT.dress;

        fabric.FabricImage.fromURL(
          item.image_url!,
          { crossOrigin: "anonymous" }
        ).then((img: any) => {
          img.set({
            ...placement,
            originX: "center",
            originY: "center",
            hasControls: true,
            hasBorders: true,
            lockUniScaling: false,
          });

          // Multiply blend mode removes white backgrounds visually
          img.set({ globalCompositeOperation: "multiply" });

          addDeleteControl(img);

          canvas.add(img);
          canvas.requestRenderAll();

          loaded++;
          setLoadedCount(loaded);
          if (loaded === itemsWithImages.length) {
            setLoading(false);
          }
        }).catch(() => {
          loaded++;
          setLoadedCount(loaded);
          if (loaded === itemsWithImages.length) {
            setLoading(false);
          }
        });
      });
    })();

    return () => {
      canvas?.dispose();
    };
  }, [result]);

  // Update background color
  const changeBg = (color: string) => {
    setBgColor(color);
    fabricRef.current?.set("backgroundColor", color);
    fabricRef.current?.requestRenderAll();
  };

  // Export as PNG
  const handleExport = () => {
    if (!fabricRef.current) return;
    const dataUrl = fabricRef.current.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2, // 2x resolution = 1200x1800px
    });
    onExport?.(dataUrl);

    // Also trigger download
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ootd-pin-${Date.now()}.png`;
    a.click();
  };

  // Bring selected to front
  const bringToFront = () => {
    const obj = fabricRef.current?.getActiveObject();
    if (obj) fabricRef.current?.bringToFront(obj);
  };

  // Send selected to back
  const sendToBack = () => {
    const obj = fabricRef.current?.getActiveObject();
    if (obj) fabricRef.current?.sendToBack(obj);
  };

  // Delete selected
  const deleteSelected = () => {
    const obj = fabricRef.current?.getActiveObject();
    if (obj) {
      fabricRef.current?.remove(obj);
      fabricRef.current?.requestRenderAll();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Loading indicator */}
      {loading && (
        <div className="text-sm text-muted-foreground text-center py-2">
          Loading images... {loadedCount}/{totalCount}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        {/* Background colors */}
        <div className="flex gap-1 items-center">
          <span className="text-xs text-muted-foreground mr-1">BG:</span>
          {PASTEL_BACKGROUNDS.map((color) => (
            <button
              key={color}
              onClick={() => changeBg(color)}
              className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={bringToFront}
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            title="Bring to front"
          >
            ↑ Front
          </button>
          <button
            onClick={sendToBack}
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            title="Send to back"
          >
            ↓ Back
          </button>
          <button
            onClick={deleteSelected}
            className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50"
            title="Delete selected"
          >
            ✕ Delete
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="border rounded-lg overflow-hidden shadow-sm">
        <canvas ref={canvasRef} />
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        className="w-full bg-red-700 hover:bg-red-800 text-white font-medium
                   py-2.5 px-4 rounded-lg flex items-center justify-center gap-2
                   transition-colors"
      >
        ↓ Download Pinterest pin
      </button>

      {/* Hint */}
      <p className="text-xs text-center text-muted-foreground">
        Drag to move · Pinch/drag corners to resize ·
        Use rotation handle · Click × to remove
      </p>
    </div>
  );
}
