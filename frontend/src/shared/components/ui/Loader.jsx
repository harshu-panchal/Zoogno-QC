import React from 'react';
import { cn } from '@/lib/utils';

const Loader = ({ size = 'md', fullScreen = false, className }) => {
    // For skeleton sizes, we adjust the dimensions to look more like text or block placeholders
    const sizeClasses = {
        sm: 'h-6 w-24',
        md: 'h-10 w-48',
        lg: 'h-16 w-64',
    };

    const skeleton = (
        <div
            className={cn(
                'animate-pulse bg-slate-200 dark:bg-slate-700 rounded-md',
                sizeClasses[size],
                className
            )}
        />
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col gap-6 p-6 md:p-12 bg-background overflow-hidden">
                <div className="flex justify-between items-center w-full">
                    <div className="h-10 w-32 animate-pulse bg-slate-200 dark:bg-slate-700 rounded-md" />
                    <div className="h-10 w-10 rounded-full animate-pulse bg-slate-200 dark:bg-slate-700" />
                </div>
                
                <div className="h-48 w-full animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl" />
                
                <div className="space-y-4">
                    <div className="h-8 w-1/3 animate-pulse bg-slate-200 dark:bg-slate-700 rounded-md" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-32 animate-pulse bg-slate-200 dark:bg-slate-700 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return skeleton;
};

export default Loader;

