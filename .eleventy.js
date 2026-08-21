import fs from 'fs'
import path from 'path'

export default function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy("public/**/*");
  
  // Don't copy dist files - they're already in dist from Vite/Tailwind builds
  // Just watch them for changes
  eleventyConfig.addWatchTarget("dist/styles.css");
  eleventyConfig.addWatchTarget("dist/assets/");
  
  // Load Vite manifest once for use in filters
  let viteManifest = {}
  const manifestPath = path.join(process.cwd(), 'dist/assets/.vite/manifest.json')
  try {

    if (fs.existsSync(manifestPath)) {
      viteManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      console.log('✓ Vite manifest loaded for asset resolution')
    }
  } catch (e) {
    console.warn('⚠ Vite manifest not found, assets will use fallback naming')
  }
  
  // Add filter to get bundle file from manifest
  eleventyConfig.addFilter("viteAsset", function(name) {
    if (!viteManifest || !viteManifest[name]) {
      console.warn(`Asset ${name} not found in manifest, using fallback`)
      console.info(viteManifest)
      return `/assets/${name}`
    }
    return `/assets/${viteManifest[name].file}`
  })
  
  return {
    dir: {
      input: "11ty",
      output: "dist",
      includes: "_includes",
      layouts: "_layouts",
    },
    templateFormats: ["md", "html", "njk"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
