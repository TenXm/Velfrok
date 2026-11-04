"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, ShoppingCart, Heart, Menu, Leaf, Monitor, Shirt, House, FlaskConical, Puzzle, CookingPot, Sprout, Droplet } from "lucide-react";
import AuthStatus from "@/components/auth-status";

const categories = [
  { name: "Electronics", icon: Monitor }, { name: "Fashion", icon: Shirt },
  { name: "Home & Living", icon: House }, { name: "Beauty", icon: FlaskConical },
  { name: "Kitchen", icon: CookingPot }, { name: "Toys & Kids", icon: Puzzle },
  { name: "Plants", icon: Sprout }, { name: "Hygiene", icon: Droplet },
];

export function StoreHeader() {
  const [query, setQuery] = useState("");
  return <>
    <div className="promo">✦ Free Shipping on Orders Over ₹999 <span>|</span> ◉ 30-Day Easy Returns <span>|</span> ♙ Secure Payments</div>
    <div className="site">
      <header className="header">
        <Link className="brand" href="/" aria-label="Velfrok home"><span className="brand-mark"><Leaf size={25}/></span><span><span className="brand-name">Velfrok</span><span className="brand-sub">BETTER LIVING.</span></span></Link>
        <form className="search" onSubmit={e => { e.preventDefault(); window.location.href = query.trim() ? `/?q=${encodeURIComponent(query.trim())}#products` : "/#products"; }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products, categories and more..." aria-label="Search products"/>
          <button type="submit" aria-label="Search"><Search size={18}/></button>
        </form>
        <div className="header-actions"><AuthStatus/><Link className="header-action" href="/#products"><Heart size={20}/>Wishlist</Link><Link className="header-action" href="/#products"><ShoppingCart size={20}/>Cart</Link></div>
      </header>
      <nav className="nav"><Link className="all" href="/#categories"><Menu size={15}/>All Categories</Link><Link href="/">Home</Link><Link href="/#products">Shop</Link><Link href="/#collections">Collections</Link><Link href="/#products">New Arrivals</Link><Link href="/#footer">About Velfrok</Link></nav>
      <section id="categories" className="categories" aria-label="Shop by category">
        {categories.map(({name,icon:Icon})=><Link key={name} className="category" href={`/?category=${encodeURIComponent(name)}#products`}><span className="category-icon"><Icon size={25}/></span>{name}</Link>)}
      </section>
    </div>
  </>;
}

export function StoreFooter() {
  return <footer id="footer" className="footer"><div className="site"><div className="footer-grid">
    <div><Link className="brand" href="/" style={{color:"#fff"}}><span className="brand-mark"><Leaf size={24}/></span><span><span className="brand-name">Velfrok</span><span className="brand-sub">BETTER LIVING.</span></span></Link><p>Useful everyday essentials for better living.</p><p>Live better with Velfrok.</p></div>
    <div><h4>Shop</h4><Link href="/#categories">All Categories</Link><Link href="/#products">New Arrivals</Link><Link href="/#products">Deals</Link><Link href="/#collections">Collections</Link></div>
    <div><h4>Customer Service</h4><Link href="/#footer">Track Order</Link><Link href="/#footer">Returns & Refunds</Link><Link href="/#footer">Shipping Info</Link><Link href="/#footer">FAQ</Link><a href="mailto:support@velfrok.com">Contact Us</a></div>
    <div><h4>Company</h4><Link href="/#footer">About Us</Link><Link href="/#footer">Privacy Policy</Link><Link href="/#footer">Terms of Service</Link></div>
    <div><h4>Store Details</h4><p>India</p><p>UPI and Cash on Delivery</p></div>
  </div><div className="footer-bottom"><span>© 2026 Velfrok. All rights reserved.</span><span>Better living. Useful everyday essentials.</span></div></div></footer>;
}
