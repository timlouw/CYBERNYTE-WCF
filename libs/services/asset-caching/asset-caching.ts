import { imageKeys } from "./asset-list";

const imageCachePrefix = 'cached-asset-';
const cacheVersionKey = 'cached-asset-version';
const cacheVersion = 1;
// update version number for cache busting - adding new images or deleting does not require cache busting - only changing existing images and leaving key the same

const imageMap: { [key: string]: { path: string; data: string } } = {};

imageKeys.forEach((key) => {
  imageMap[key] = { path: `./assets/icons/${key}.svg`, data: '' };
});

// image keys that rename the same when actual image is changed will remain cached until cacheVersion is updated
// NB!! ensure that this asset path exists otherwise api will return the index.html file

const indexHTMLContains = '<!DOCTYPE html>';
const indexHTMLError = 'Image does not exist in file system so index.html was returned by api by default, make sure to add an existing file and path to the imageMap!';

const clearCachedAssets = () => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(imageCachePrefix)) {
      localStorage.removeItem(key);
    }
  }
};

const clearDeletedCachedAssets = () => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(imageCachePrefix) && key !== cacheVersionKey) {
      const assetKey = key.replace(imageCachePrefix, '');
      if (!imageMap[assetKey]) {
        localStorage.removeItem(key);
      }
    }
  }
};

const checkCacheVersion = () => {
  const cacheVersionInLocalStorage = localStorage.getItem(cacheVersionKey);
  if (cacheVersionInLocalStorage) {
    if (+cacheVersionInLocalStorage !== cacheVersion) {
      clearCachedAssets();
      localStorage.setItem(cacheVersionKey, cacheVersion.toString());
    }
  } else {
    localStorage.setItem(cacheVersionKey, cacheVersion.toString());
  }
};

checkCacheVersion();
clearDeletedCachedAssets();

const fetchAndSetImage = (imageName: string) => {
  return fetch(imageMap[imageName].path)
    .then((response) => response.text())
    .then((svgString) => {
      if (svgString.includes(indexHTMLContains)) {
        console.error(indexHTMLError);
        return '';
      } else {
        imageMap[imageName].data = svgString;
        localStorage.setItem(imageCachePrefix + imageName, svgString);
        return svgString;
      }
    });
};

export const getImage = (imageName: string, color = ''): Promise<string> => {
  return new Promise(async (resolve) => {
    if (imageMap[imageName]) {
      let svgString = imageMap[imageName].data;

      if (!svgString) {
        const localStorageTemp = localStorage.getItem(imageCachePrefix + imageName) ?? '';
        if (localStorageTemp.includes(indexHTMLContains)) {
          localStorage.removeItem(imageCachePrefix + imageName);
          console.error(indexHTMLError);
        } else {
          svgString = localStorageTemp;
        }
      }

      if (!svgString) {
        svgString = await fetchAndSetImage(imageName);
      }

      if (svgString) {
        if (color) {
          svgString = svgString.replace('<svg', `<svg fill="${color}" `);
        }
        resolve('data:image/svg+xml,' + encodeURIComponent(svgString));
      } else {
        resolve('');
      }
    } else {
      console.error('Image was not found in image map - make sure to add new/updated images to the imageMap!');
      resolve('');
    }
  });
};
