#!/usr/bin/env node
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = path.join(__dirname, "../public");
const SOURCE_LOGO = path.join(__dirname, "../public/logo.png");
const WHITE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateAllIcons() {
  console.log("🎨 Generating ALL PWA icons for Hue Studios...");
  console.log("🎨 Style: Full bleed with white background (no padding)");
  console.log("🎨 Background: White (#ffffff)\n");

  // Check if source file exists
  if (!fs.existsSync(SOURCE_LOGO)) {
    console.error(`❌ Source logo not found: ${SOURCE_LOGO}`);
    console.error(
      "Please ensure you have a logo.png file in the /public directory",
    );
    process.exit(1);
  }

  try {
    // Generate standard icons - NO PADDING, full bleed
    console.log("📱 Generating standard icons (full bleed, no padding)...");
    for (const size of SIZES) {
      await sharp(SOURCE_LOGO)
        .resize(size, size, {
          fit: "cover", // Use 'cover' to fill entire space
          position: "center",
          background: WHITE_BG,
        })
        .png()
        .toFile(path.join(OUTPUT_DIR, `icon-${size}x${size}.png`));
      console.log(`   ✅ icon-${size}x${size}.png`);
    }

    // Generate Apple Touch Icon - NO PADDING
    console.log("\n🍎 Generating Apple Touch Icon (full bleed)...");
    await sharp(SOURCE_LOGO)
      .resize(180, 180, {
        fit: "cover",
        position: "center",
        background: WHITE_BG,
      })
      .png()
      .toFile(path.join(OUTPUT_DIR, "apple-touch-icon.png"));
    console.log("   ✅ apple-touch-icon.png (180x180)");

    // Generate Maskable Icon with MINIMAL safe zone (10% instead of 20%)
    console.log(
      "\n🎭 Generating Maskable Icon (with minimal 10% safe zone)...",
    );

    // Resize logo to 90% of target size (461px for 512px canvas)
    const logoBuffer = await sharp(SOURCE_LOGO)
      .resize(461, 461, {
        fit: "cover",
        position: "center",
        background: WHITE_BG,
      })
      .toBuffer();

    // Composite onto white 512x512 canvas
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: WHITE_BG,
      },
    })
      .composite([
        {
          input: logoBuffer,
          top: 25, // Center vertically: (512 - 461) / 2 = 25.5
          left: 25, // Center horizontally: (512 - 461) / 2 = 25.5
        },
      ])
      .png()
      .toFile(path.join(OUTPUT_DIR, "maskable-icon-512x512.png"));
    console.log(
      "   ✅ maskable-icon-512x512.png (512x512 - minimal safe zone)",
    );

    // Generate Favicon (32x32) - NO PADDING
    console.log("\n🌐 Generating Favicon...");
    await sharp(SOURCE_LOGO)
      .resize(32, 32, {
        fit: "cover",
        position: "center",
        background: WHITE_BG,
      })
      .png()
      .toFile(path.join(OUTPUT_DIR, "favicon-32x32.png"));
    console.log("   ✅ favicon-32x32.png");

    // Generate favicon.ico - NO PADDING
    console.log("\n🔖 Generating favicon.ico...");
    await sharp(SOURCE_LOGO)
      .resize(32, 32, {
        fit: "cover",
        position: "center",
        background: WHITE_BG,
      })
      .toFormat("png")
      .toFile(path.join(OUTPUT_DIR, "favicon.ico"));
    console.log("   ✅ favicon.ico (32x32)");

    console.log("\n✨ SUCCESS! All icons generated!");
    console.log(`📁 Location: ${OUTPUT_DIR}`);
    console.log("\n📊 Summary:");
    console.log("   • 8 standard icons (72-512) - FULL BLEED");
    console.log("   • 1 Apple touch icon (180) - FULL BLEED");
    console.log("   • 1 Maskable icon (512) - MINIMAL 10% safe zone");
    console.log("   • 1 Favicon PNG (32)");
    console.log("   • 1 Favicon ICO");
    console.log("   • All with white (#ffffff) backgrounds ✅");
    console.log("   • No unnecessary padding ✅");
    console.log("\n📋 Total: 11 icon files");

    // List all generated files with sizes
    console.log("\n📂 Generated files:");
    const files = [
      ...SIZES.map((s) => `icon-${s}x${s}.png`),
      "apple-touch-icon.png",
      "maskable-icon-512x512.png",
      "favicon-32x32.png",
    ];

    files.forEach((file) => {
      const filePath = path.join(OUTPUT_DIR, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`   ${file} (${sizeKB} KB)`);
      }
    });

    console.log(
      "\n💡 Note: Standard icons use full bleed (no padding) for maximum impact!",
    );
    console.log(
      "   Only the maskable icon has a minimal 10% safe zone for Android compatibility.",
    );
  } catch (error) {
    console.error("\n❌ Error generating icons:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the generator
generateAllIcons();
