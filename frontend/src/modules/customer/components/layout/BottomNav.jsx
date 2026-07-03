import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Category', icon: LayoutGrid, path: '/categories' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-gray-100 flex flex-col md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-[65px] px-2 relative w-full">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                        (item.path !== '/' && location.pathname.startsWith(item.path));

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="flex-1 flex flex-col items-center justify-center h-full relative group transition-all"
                        >
                            {/* Top Accent Line for Active State */}
                            {isActive && (
                                <div className="absolute top-0 w-8 h-[3px] bg-primary rounded-b-full transition-opacity duration-300" />
                            )}

                            <div className={cn(
                                "flex flex-col items-center justify-center w-16 h-14 rounded-2xl relative transition-all duration-300",
                                isActive ? "bg-primary/5 scale-105" : "bg-transparent scale-100"
                            )}>
                                <item.icon
                                    size={22}
                                    strokeWidth={isActive ? 2.5 : 2}
                                    className={cn(
                                        "transition-colors duration-300 mb-0.5",
                                        isActive ? "text-primary" : "text-gray-400"
                                    )}
                                />
                                <span
                                    className={cn(
                                        "text-[10px] font-bold tracking-tight transition-all duration-300",
                                        isActive ? "text-primary" : "text-gray-400"
                                    )}
                                >
                                    {item.label}
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default BottomNav;

