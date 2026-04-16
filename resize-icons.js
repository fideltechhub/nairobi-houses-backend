 const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputImage = 'C:\\Users\\fidel\\OneDrive\\Desktop\\fidel\\WhatsApp Image 2026-04-16 at 02.22.44.jpeg';

const androidResDir = 'C:\\Users\\fidel\\OneDrive\\Desktop\\FOLDERS\\nairobi-houses\\client\\android\\app\\src\\main\\res';

const sizes = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

async function generateIcons() {
  for (const { folder, size } of sizes) {
    const outputPath = path.join(androidResDir, folder, 'ic_launcher.png');
    await sharp(inputImage)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(outputPath);
    console.log(`✅ Generated ${size}x${size} → ${folder}`);
  }
  console.log('\n🎉 All icons replaced successfully!');
}

generateIcons().catch(console.error);