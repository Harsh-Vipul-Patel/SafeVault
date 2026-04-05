"use client";

import React, { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ShieldCheck, BarChart3, Users, Zap, ArrowRight, Lock, ChevronDown, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToFeatures = () => {
    const element = document.getElementById("what-we-do");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", paddingBottom: "100px" }}>
      {/* Background Graphic Effects */}
      <div style={{
        position: "absolute", top: "-10%", left: "-10%", width: "50%", height: "50%",
        background: "radial-gradient(circle, rgba(201, 150, 42, 0.15) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0
      }} />
      <div style={{
        position: "absolute", top: "30%", right: "-10%", width: "60%", height: "60%",
        background: "radial-gradient(circle, rgba(27, 79, 138, 0.1) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0
      }} />

      {/* Navbar */}
      <header
        className={scrolled ? "glass-surface" : ""}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          padding: "1rem 2rem", transition: "all 0.3s ease",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: scrolled ? "1px solid var(--glass-border)" : "1px solid transparent",
          backgroundColor: scrolled ? "rgba(13, 27, 42, 0.8)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontFamily: "'Playfair Display', serif" }}>
          <div style={{ 
            background: "var(--grad-gold)", color: "var(--navy)", padding: "0.4rem", 
            borderRadius: "var(--r-sm)", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Lock size={20} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "1px" }}>Safe Vault</span>
        </div>
        
        <nav style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <button 
            onClick={scrollToFeatures}
            style={{ 
              background: "none", border: "none", color: "var(--cream)", 
              cursor: "pointer", fontSize: "0.95rem", fontWeight: 500, letterSpacing: "0.5px"
            }}
          >
            What We Do
          </button>
          <button 
            onClick={() => router.push("/login")}
            className="pearl-card"
            style={{ 
              padding: "0.6rem 1.5rem", color: "var(--white)", border: "1px solid var(--gold)",
              fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer",
              borderRadius: "2rem", background: "rgba(201, 150, 42, 0.1)"
            }}
          >
            <UserCircle2 size={18} />
            Login
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "1200px", margin: "0 auto", padding: "0 2rem" }}>
        
        <section style={{ 
          minHeight: "100vh", display: "flex", flexDirection: "column", 
          justifyContent: "center", alignItems: "center", textAlign: "center",
          paddingTop: "4rem"
        }}>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" style={{ maxWidth: "800px" }}>
            <motion.div variants={fadeUp} style={{ marginBottom: "1.5rem" }}>
              <span className="text-gradient-gold" style={{ 
                fontSize: "0.9rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px" 
              }}>
                The Future of Banking
              </span>
            </motion.div>
            
            <motion.h1 variants={fadeUp} style={{ 
              fontFamily: "'Playfair Display', serif", fontSize: "clamp(3.5rem, 8vw, 5.5rem)", 
              lineHeight: 1.1, fontWeight: 900, marginBottom: "1.5rem",
              textShadow: "0 10px 30px rgba(0,0,0,0.5)"
            }}>
              Uncompromising <span className="text-gradient-gold">Security</span> & Elegance.
            </motion.h1>
            
            <motion.p variants={fadeUp} style={{ 
              fontSize: "1.2rem", color: "var(--muted)", maxWidth: "600px", 
              margin: "0 auto 3rem auto", lineHeight: 1.6 
            }}>
              Experience a sophisticated core banking platform designed for absolute data integrity, intelligent role-based access, and seamless financial operations.
            </motion.p>
            
            <motion.div variants={fadeUp} style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
              <button 
                onClick={() => router.push("/login")}
                style={{
                  background: "var(--grad-gold)", color: "var(--navy)", border: "none",
                  padding: "1rem 2.5rem", fontSize: "1.05rem", fontWeight: 700,
                  borderRadius: "3rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem",
                  boxShadow: "0 10px 20px -5px rgba(201, 150, 42, 0.4)",
                  transition: "transform 0.3s ease"
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
                onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
              >
                Access Portal
                <ArrowRight size={20} />
              </button>
              <button 
                onClick={scrollToFeatures}
                className="glass-surface"
                style={{
                  color: "var(--white)", padding: "1rem 2.5rem", fontSize: "1.05rem", fontWeight: 600,
                  borderRadius: "3rem", cursor: "pointer", transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
                onMouseOut={(e) => e.currentTarget.style.background = "var(--glass)"}
              >
                Learn More
              </button>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 1.5, duration: 1 }}
            style={{ position: "absolute", bottom: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}
          >
            <span style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "2px" }}>Scroll</span>
            <motion.div 
              animate={{ y: [0, 8, 0] }} 
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <ChevronDown size={20} />
            </motion.div>
          </motion.div>
        </section>

        {/* What We Do Section */}
        <section id="what-we-do" style={{ paddingTop: "8rem", paddingBottom: "4rem" }}>
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            style={{ textAlign: "center", marginBottom: "5rem" }}
          >
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "3rem", marginBottom: "1rem" }}>
              What We Do
            </h2>
            <div style={{ width: "60px", height: "3px", background: "var(--grad-gold)", margin: "0 auto", borderRadius: "2px" }} />
            <p style={{ color: "var(--muted)", maxWidth: "700px", margin: "2rem auto 0", fontSize: "1.1rem", lineHeight: 1.7 }}>
              Safe Vault provides a modern, robust architecture tailored for multi-tier banking. From customer self-service to branch management, our ecosystem is built on a foundation of absolute security and operational excellence.
            </p>
          </motion.div>

          <div style={{ 
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" 
          }}>
            {[
              { 
                title: "Oracle-Powered Engine", 
                icon: Zap, 
                desc: "Powered by deep Oracle PL/SQL architectures, executing complex interest calculations and fee logic instantly at the data layer for zero-latency settlements.",
                color: "var(--gold)"
              },
              { 
                title: "Zero-Trust Beneficiary Protocols", 
                icon: ShieldCheck, 
                desc: "An impenetrable routing guard system with absolute beneficiary activation validation—preventing ghost transfers before they are computationally attempted.",
                color: "var(--customer)"
              },
              { 
                title: "Dynamic Island Telemetry", 
                icon: BarChart3, 
                desc: "Next-gen iOS-style interactive toasts instantly beam database-triggered alerts to your screen, unifying all operational communications in a sleek UI.",
                color: "var(--teller)"
              },
              { 
                title: "Instant Yield & Margin MIS", 
                icon: Users, 
                desc: "Branch Managers have immediate access to live Net Interest Margins (NIM) and liquidity metrics, eliminating the need for archaic overnight batch processing.",
                color: "var(--admin)"
              }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="dashboard-card"
                style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative", overflow: "hidden" }}
              >
                <div style={{ 
                  position: "absolute", top: "-20px", right: "-20px", width: "100px", height: "100px", 
                  background: `radial-gradient(circle, ${feature.color} 0%, transparent 70%)`, opacity: 0.1, zIndex: 0 
                }} />
                
                <div style={{ 
                  background: "rgba(255,255,255,0.05)", width: "50px", height: "50px", borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center", 
                  color: feature.color, marginBottom: "0.5rem", zIndex: 1
                }}>
                  <feature.icon size={24} />
                </div>
                
                <h3 style={{ fontSize: "1.3rem", fontWeight: 600, fontFamily: "'Playfair Display', serif", zIndex: 1 }}>
                  {feature.title}
                </h3>
                
                <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: "0.95rem", zIndex: 1 }}>
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ 
        marginTop: "6rem", borderTop: "1px solid var(--glass-border)", padding: "3rem 2rem",
        textAlign: "center"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.7 }}>
            <Lock size={16} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 700 }}>Safe Vault</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            &copy; {new Date().getFullYear()} Safe Vault Premium Banking. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
