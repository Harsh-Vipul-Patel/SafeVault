'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

/**
 * SidebarNav — Banking-grade vertical navigation.
 *
 * Design principles (vs. the old scroll-carousel):
 *  - All items visible instantly → no hunting, no hidden options
 *  - Active item: gold left-accent bar + gold text + subtle bg tint
 *  - Hover: slight right-nudge (2px) + text brightens
 *  - Groups: monospace section labels + hairline divider between groups
 *  - layoutId on the accent bar → smooth shared layout animation between routes
 *  - Auto-scrolls the active item into view within the sidebar whenever
 *    activePath changes (so deep items like "Cheque Management" are always visible)
 *
 * Props (drop-in replacement for PortalPillNav):
 *  @param {Array}  groups      — [{ title, items: [{icon, label, path, restricted}] }]
 *  @param {string} activePath  — current next/navigation pathname
 */
export default function SidebarNav({ groups = [], activePath }) {
    const router = useRouter();

    // Ref map: path → button DOM element
    const itemRefs = useRef({});

    // ── Auto-scroll active item into view on route change ──
    useEffect(() => {
        const el = itemRefs.current[activePath];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activePath]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {groups.map((group, gi) => {
                const visibleItems = (group.items || []).filter(
                    (item) => item.path && !item.restricted
                );
                if (!visibleItems.length) return null;

                return (
                    <div key={gi}>
                        {/* ── Section divider (between groups) ── */}
                        {gi > 0 && (
                            <div style={{
                                height: '1px',
                                margin: '12px 4px 14px',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.06) 60%, transparent)',
                            }} />
                        )}

                        {/* ── Section label ── */}
                        {group.title && (
                            <div style={{
                                padding: '0 14px',
                                marginBottom: '8px',
                                marginTop: gi > 0 ? '0' : '4px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                color: 'var(--muted)',
                                fontFamily: "'DM Mono', monospace",
                                opacity: 0.7,
                            }}>
                                {group.title}
                            </div>
                        )}

                        {/* ── Nav items ── */}
                        {visibleItems.map((item, ii) => {
                            const isActive = item.path === activePath;

                            return (
                                <motion.button
                                    key={item.path || ii}
                                    // Store ref by path so useEffect can find the active one
                                    ref={(el) => {
                                        if (el) itemRefs.current[item.path] = el;
                                    }}
                                    onClick={() => router.push(item.path)}
                                    whileHover={{ x: 2 }}
                                    whileTap={{ scale: 0.98 }}
                                    title={item.label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '11px',
                                        width: '100%',
                                        padding: '11px 16px 11px 16px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: isActive
                                            ? 'rgba(201, 150, 42, 0.09)'
                                            : 'transparent',
                                        color: isActive ? 'var(--gold2)' : 'var(--muted)',
                                        cursor: 'pointer',
                                        fontSize: '14.5px',
                                        fontWeight: isActive ? 600 : 500,
                                        fontFamily: "'DM Sans', sans-serif",
                                        textAlign: 'left',
                                        position: 'relative',
                                        transition: 'color 0.18s ease, background 0.18s ease',
                                        letterSpacing: '0.01em',
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {/* Gold left-accent bar — animates between active items */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebarActiveBar"
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '3px',
                                                height: '18px',
                                                background: 'var(--gold2)',
                                                borderRadius: '0 4px 4px 0',
                                                boxShadow: '0 0 8px rgba(201,150,42,0.5)',
                                            }}
                                            transition={{
                                                type: 'spring',
                                                stiffness: 380,
                                                damping: 30,
                                            }}
                                        />
                                    )}

                                    {/* Icon */}
                                    <span style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexShrink: 0,
                                        color: isActive ? 'var(--gold2)' : 'inherit',
                                        opacity: isActive ? 1 : 0.65,
                                        transition: 'opacity 0.18s ease, color 0.18s ease',
                                    }}>
                                        {item.icon}
                                    </span>

                                    {/* Label */}
                                    <span style={{
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {item.label}
                                    </span>

                                    {/* Active dot indicator */}
                                    {isActive && (
                                        <span style={{
                                            width: '5px',
                                            height: '5px',
                                            borderRadius: '50%',
                                            background: 'var(--gold2)',
                                            flexShrink: 0,
                                            boxShadow: '0 0 6px var(--gold)',
                                        }} />
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
