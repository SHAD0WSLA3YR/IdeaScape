import React, { useRef, useEffect } from 'react';

interface RichTextEditorProps {
    nodeId: string;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onSave?: () => void;
    groupColor: string;
    autoFocus?: boolean;
}

export function RichTextEditor({
    nodeId,
    value,
    onChange,
    onBlur,
    onSave,
    groupColor,
    autoFocus = false,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);



    // Initialize editor content and set up event listeners
    useEffect(() => {
        const editorElement = editorRef.current;
        if (!editorElement) return;

        // Sync initial content
        if (value !== editorElement.innerHTML) {
            // Ensure we have proper content structure
            const content = value || '<div style="font-size: 14px;">Double-click to edit</div>';
            editorElement.innerHTML = content;
        }

        // Auto focus and select
        if (autoFocus) {
            editorElement.focus();
            if (editorElement.textContent === 'Double-click to edit') {
                const range = document.createRange();
                range.selectNodeContents(editorElement);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    }, [value, autoFocus]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!editorRef.current?.contains(e.target as Node)) return;

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSave?.();
            }
            
            // Allow Shift+Enter to work naturally - don't prevent default
            // The browser will handle line breaks correctly by itself
            
            if (e.key === 'Escape') {
                onSave?.();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onSave]);

    const handleInput = () => {
        if (editorRef.current) {
            const content = editorRef.current.innerHTML;
            const textContent = editorRef.current.textContent;
            
            if (!textContent?.trim()) {
                onChange('<div style="font-size: 14px;">Double-click to edit</div>');
            } else {
                // Just pass through content as the browser creates it
                onChange(content);
            }
        }
    };

    const handleBlur = (e: React.FocusEvent) => {
        setTimeout(() => {
            if (document.querySelector('.edit-submenu')) {
                return;
            }
            onBlur();
        }, 150);
    };

    return (
        <div className="relative w-full h-full">
            <div
                ref={editorRef}
                contentEditable
                data-node-id={nodeId}
                onInput={handleInput}
                onBlur={handleBlur}
                onFocus={(e) => {
                    const element = e.target as HTMLElement;
                    if (element.textContent === 'Double-click to edit') {
                        setTimeout(() => {
                            const range = document.createRange();
                            range.selectNodeContents(element);
                            const selection = window.getSelection();
                            selection?.removeAllRanges();
                            selection?.addRange(range);
                        }, 0);
                    }
                }}
                className="w-full h-full outline-none overflow-auto cursor-text select-text rich-text-editor-content text-gray-900 dark:text-gray-100"
                style={{
                    minHeight: '60px',
                    lineHeight: '1.4'
                }}
                suppressContentEditableWarning={true}
            />

            <div className="absolute bottom-1 right-4 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
                Right-click to format • Enter to save
            </div>
        </div>
    );
}