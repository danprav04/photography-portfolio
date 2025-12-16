// ---------------------------------------------------------
// GEAR DATA (Updated with US ASINs)
// ---------------------------------------------------------
const gearList = [
    // --- CAMERAS ---
    {
      id: "camera-xs20",
      name: "FUJIFILM X-S20 Mirrorless Camera Body",
      description: "My daily driver for both photography and video work. Compact, powerful, and reliable.",
      asin: "B0C5PHCFRQ", 
      type: "amazon"
    },
    
    // --- LENSES ---
    {
      id: "lens-23mm",
      name: "Viltrox 23mm F1.4 Lens",
      description: "A fast prime lens perfect for dark scenes, street photography and environmental portraits.",
      asin: "B088WJ9MVY", 
      type: "amazon"
    },
    {
      id: "lens-35mm",
      name: "FUJIFILM XC 35mm F2 Lens",
      description: "Sharp, lightweight, and versatile. The 'nifty fifty' equivalent for APS-C.",
      asin: "B08412XPWK",
      type: "amazon"
    },
    {
      id: "lens-70300",
      name: "FUJIFILM XF 70-300mm F4-5.6 R LM OIS WR",
      description: "Essential for compressing landscapes and capturing distant subjects.",
      asin: "B08TMZ59ZW",
      type: "amazon"
    },
  
    // --- ACCESSORIES ---
    {
      id: "clean-kit",
      name: "K&F Concept Camera Cleaning Kit",
      description: "Essential maintenance tools to keep sensors and glass dust-free.",
      asin: "B0FC28VCYM", 
      type: "amazon"
    },
    {
      id: "blower",
      name: "Giottos Rocket Air Blower",
      asin: "B00017LSPI",
      type: "amazon"
    },
    {
      id: "tripod",
      name: "Benro Slim Tripod",
      description: "Lightweight carbon fiber tripod, perfect for travel and long exposures.",
      asin: "B072K62KMH",
      type: "amazon"
    },
    
    {
      id: "bag",
      name: "K&F Concept Sling Bag 10L",
      description: "Holds the camera + 3 lenses comfortably. Great for day trips.",
      asin: "B072K62KMH",
      type: "amazon"
    },
  ];
  
  // ---------------------------------------------------------
  // HELPER FUNCTION
  // ---------------------------------------------------------
  function getGearLink(item, amazonTag) {
    if (item.type === "amazon" && amazonTag) {
      return `https://www.amazon.com/dp/${item.asin}?tag=${amazonTag}`;
    }
    return item.url || '#';
  }
  
  /**
   * Renders the gear list into the specified container.
   * @param {string} containerId - The ID of the container element.
   * @param {string} amazonTag - The Amazon Associates store ID.
   */
  export function initGear(containerId, amazonTag) {
      const container = document.getElementById(containerId);
      if (!container) return;
  
      container.innerHTML = '';
      
      const grid = document.createElement('div');
      grid.className = 'gear-grid';
  
      gearList.forEach(item => {
          const link = document.createElement('a');
          link.href = getGearLink(item, amazonTag);
          link.className = 'gear-item';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          
          // Container for Title and Description
          const infoDiv = document.createElement('div');
          infoDiv.className = 'gear-info';

          const title = document.createElement('div');
          title.className = 'gear-title';
          title.textContent = item.name;
          infoDiv.appendChild(title);

          if (item.description) {
              const desc = document.createElement('div');
              desc.className = 'gear-description';
              desc.textContent = item.description;
              infoDiv.appendChild(desc);
          }
          
          // Icon arrow
          const icon = document.createElement('span');
          icon.className = 'gear-icon';
          icon.innerHTML = item.type === 'amazon' ? '&#8599;' : '&rarr;'; // NE arrow for Amazon, R arrow for direct
  
          link.appendChild(infoDiv);
          link.appendChild(icon);
          grid.appendChild(link);
      });
  
      container.appendChild(grid);
  }