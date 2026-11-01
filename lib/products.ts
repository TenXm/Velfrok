export type Product = {
  id: string; name: string; category: string; price: number; mrp: number;
  rating: string; reviews: string; image: string; badge: string; description: string;
};

export const products: Product[] = [
  { id:"p1", name:"Noise Cancelling Headphones", category:"Electronics", price:2499, mrp:3199, rating:"4.8", reviews:"1,234", image:"https://images.unsplash.com/photo-150ja4431-3b6d7c0f2f26?auto=format&fit=crop&w=700&q=85", badge:"-22%", description:"Comfort-first sound for focus, travel, and everyday listening." },
  { id:"p2", name:"Linen Casual Shirt", category:"Fashion", price:1299, mrp:1699, rating:"4.7", reviews:"812", image:"https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=700&q=85", badge:"-24%", description:"A breathable everyday layer with a relaxed, timeless fit." },
  { id:"p3", name:"Minimalist Niacinamide Serum", category:"Beauty", price:699, mrp:899, rating:"4.9", reviews:"645", image:"https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=700&q=85", badge:"-22%", description:"A simple skincare essential for your daily routine." },
  { id:"p4", name:"Compact Coffee Maker", category:"Home & Living", price:3499, mrp:4999, rating:"4.6", reviews:"963", image:"https://images.unsplash.com/photo-1517668808822-9ebb02f2ca9f?auto=format&fit=crop&w=700&q=85", badge:"-30%", description:"Make your morning coffee ritual a little easier." },
  { id:"p5", name:"Urban Travel Backpack", category:"Fashion", price:1899, mrp:2399, rating:"4.8", reviews:"1,108", image:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=700&q=85", badge:"-21%", description:"A practical, clean-lined carryall for commutes and weekends." },
  { id:"p6", name:"Everyday Smart Watch", category:"Electronics", price:2999, mrp:3999, rating:"4.7", reviews:"734", image:"https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=700&q=85", badge:"-25%", description:"Keep useful everyday features close at hand." },
  { id:"p7", name:"Ceramic Desk Planter", category:"Home & Living", price:599, mrp:799, rating:"4.6", reviews:"418", image:"https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=700&q=85", badge:"-25%", description:"A small touch of greenery for your home or workspace." },
  { id:"p8", name:"Softcover Journal", category:"Books", price:349, mrp:449, rating:"4.8", reviews:"291", image:"https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=700&q=85", badge:"-22%", description:"A calm place for notes, lists, and new ideas." }
];
