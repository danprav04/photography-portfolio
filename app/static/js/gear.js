// ---------------------------------------------------------
// GEAR DATA (Updated with US ASINs)
// ---------------------------------------------------------
const gearList = [
    // --- CAMERAS ---
    {
      id: "camera-xs20",
      name: "FUJIFILM X-S20 Mirrorless Camera Body",
      asin: "B0C5P9N74W", 
      type: "amazon"
    },
    
    // --- LENSES ---
    {
      id: "lens-23mm",
      name: "Viltrox 23mm F1.4 Lens",
      asin: "B08N4M6B5N", 
      type: "amazon"
    },
    {
      id: "lens-35mm",
      name: "FUJIFILM XC 35mm F2 Lens",
      asin: "B084BH26K7",
      type: "amazon"
    },
    {
      id: "lens-70300",
      name: "FUJIFILM XF 70-300mm F4-5.6 R LM OIS WR",
      asin: "B08WPRK55Y",
      type: "amazon"
    },
  
    // --- ACCESSORIES ---
    {
      id: "clean-kit",
      name: "K&F Concept Camera Cleaning Kit",
      asin: "B099K587G6", 
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
      asin: "B07537FXFM",
      type: "amazon"
    },
    
    // --- DIRECT LINKS ---
    {
      id: "bag",
      name: "K&F Concept Sling Bag 10L",
      url: "https://www.aliexpress.com/item/YOUR_LINK_HERE", 
      type: "direct"
    },
    {
      id: "battery",
      name: "K&F Concept NP-W235 USB-C Battery",
      url: "https://www.aliexpress.com/item/YOUR_LINK_HERE",
      type: "direct"
    }
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
          
          const title = document.createElement('span');
          title.className = 'gear-title';
          title.textContent = item.name;
          
          const icon = document.createElement('span');
          icon.className = 'gear-icon';
          icon.innerHTML = item.type === 'amazon' ? '&#8599;' : '&rarr;'; // NE arrow for Amazon, R arrow for direct
  
          link.appendChild(title);
          link.appendChild(icon);
          grid.appendChild(link);
      });
  
      container.appendChild(grid);
  }