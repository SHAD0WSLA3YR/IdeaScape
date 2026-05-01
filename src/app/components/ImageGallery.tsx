import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Download, Copy, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';

interface ImageGalleryProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (index: number) => void;
}

export function ImageGallery({ images, initialIndex, open, onOpenChange, onDelete }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  // Auto-scroll to selected thumbnail
  useEffect(() => {
    if (thumbnailRefs.current[currentIndex]) {
      thumbnailRefs.current[currentIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentIndex]);

  // Scroll carousel left/right
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (thumbnailContainerRef.current) {
      const scrollAmount = 200;
      thumbnailContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleDownload = async () => {
    try {
      const image = images[currentIndex];
      const response = await fetch(image);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Image downloaded');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download image');
    }
  };

  const handleCopy = async () => {
    try {
      const image = images[currentIndex];
      
      // Try to copy as blob (preferred method)
      try {
        const response = await fetch(image);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        toast.success('Image copied to clipboard');
        return;
      } catch (blobError) {
        // Fallback: copy image URL as text
        await navigator.clipboard.writeText(image);
        toast.success('Image URL copied to clipboard');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('Failed to copy image');
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(currentIndex);
      toast.success('Image deleted');
      
      // Close if no more images, otherwise go to previous image
      if (images.length === 1) {
        onOpenChange(false);
      } else if (currentIndex >= images.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    
    switch (e.key) {
      case 'ArrowLeft':
        handlePrevious();
        break;
      case 'ArrowRight':
        handleNext();
        break;
      case 'Escape':
        onOpenChange(false);
        break;
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex]);

  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden [&>button]:hidden">
        {/* Visually hidden accessibility elements */}
        <DialogTitle className="sr-only">
          Image Gallery - Image {currentIndex + 1} of {images.length}
        </DialogTitle>
        <DialogDescription className="sr-only">
          View and manage images. Use arrow keys to navigate, ESC to close.
        </DialogDescription>
        
        <div className="relative w-full h-full flex items-center justify-center min-h-[70vh]">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
            title="Close (Esc)"
          >
            <X size={24} />
          </button>

          {/* Action buttons */}
          <div className="absolute top-4 right-16 z-50 flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
              title="Download image"
            >
              <Download size={20} />
            </button>
            <button
              onClick={handleCopy}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
              title="Copy image"
            >
              <Copy size={20} />
            </button>
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-full bg-black/50 hover:bg-red-600/70 text-white transition-all"
                title="Delete image"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>

          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <button
                onClick={handlePrevious}
                className="absolute left-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Previous (←)"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Next (→)"
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}

          {/* Image */}
          <div className="w-full h-full flex items-center justify-center px-20 py-16">
            <img
              src={images[currentIndex]}
              alt={`Image ${currentIndex + 1} of ${images.length}`}
              className="max-w-full max-h-[calc(90vh-8rem)] object-contain rounded-lg shadow-2xl"
              style={{ userSelect: 'none' }}
            />
          </div>

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/50 text-white text-sm">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Horizontal thumbnail carousel (WhatsApp style) */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl flex items-center gap-2">
              {/* Left scroll arrow */}
              <button
                onClick={() => scrollCarousel('left')}
                className="flex-shrink-0 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all z-10"
                title="Scroll left"
              >
                <ChevronLeft size={20} />
              </button>

              {/* Thumbnail container */}
              <div 
                ref={thumbnailContainerRef}
                className="flex items-center gap-2 overflow-x-auto pb-2 px-2 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent flex-1"
              >
                {images.map((image, index) => (
                  <button
                    key={index}
                    ref={(el) => (thumbnailRefs.current[index] = el)}
                    onClick={() => setCurrentIndex(index)}
                    className={`flex-shrink-0 relative rounded-lg overflow-hidden transition-all duration-200 ${
                      index === currentIndex
                        ? 'ring-2 ring-white scale-110 shadow-lg'
                        : 'opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                    title={`Go to image ${index + 1}`}
                  >
                    <img
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-16 h-16 object-cover"
                    />
                    {/* Active indicator overlay */}
                    {index === currentIndex && (
                      <div className="absolute inset-0 bg-white/20 pointer-events-none" />
                    )}
                  </button>
                ))}
              </div>

              {/* Right scroll arrow */}
              <button
                onClick={() => scrollCarousel('right')}
                className="flex-shrink-0 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all z-10"
                title="Scroll right"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
