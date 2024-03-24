const { Storage } = require("@google-cloud/storage");
const os = require("os");
const fs = require("fs");
const axios = require("axios");
const sharp = require("sharp");
const path = require("path");

const storage = new Storage();
const bucketName = "cdn.cottonet.co.il";
const localTempDirectory = "Desktop/cotton";
const localDirectory = path.join(os.homedir(), localTempDirectory);
const lookInSubdirectory = "newsite/2024/03"; // empty string for root directory

async function convertToWebp(localPath, savePath) {
  try {
    await sharp(localPath).webp().toFile(savePath);
  } catch (err) {
    console.error(
      `An error occurred while converting the image to webp: ${err}`
    );
  }
}

async function downloadImageFromUrl(url, savePath) {
  const writer = fs.createWriteStream(savePath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function checkWebpVersion(bucketName, localDirectory) {
  // test connection to bucket to see if it exists and we have access to it
  try {
    await storage.bucket(bucketName).exists();
  } catch (err) {
    console.error(
      `An error occurred while trying to access the bucket: ${err}`
    );
  }

  let [files] = await storage
    .bucket(bucketName)
    .getFiles({ prefix: lookInSubdirectory });

  // filter out files containing .bk. in the name
  files = files.filter((file) => !file.name.includes(".bk."));

  for (const file of files) {
    if (!file.name.endsWith(".webp")) {
      // Separate the base file name and the path in the bucket
      const pathParts = file.name.split("/");
      const fileName = pathParts.pop();
      const bucketPath = pathParts.join("/");

      // Check if webp version exists
      const baseName = fileName.split(".").join(".");
      const webpFileName = `${baseName}.webp`;
      const webpFile = storage
        .bucket(bucketName)
        .file(`${bucketPath ? `${bucketPath}/` : ""}${webpFileName}`);

      // Check if the webp version exists
      if (!(await webpFile.exists())[0]) {
        console.log(`WebP version for ${file.name} does not exist.`);
        const localPath = path.join(localDirectory, fileName);
        const webpPath = path.join(localDirectory, webpFileName);

        // Download the image file
        await downloadImageFromUrl(
          `https://storage.googleapis.com/${bucketName}/${file.name}`,
          localPath
        );

        // Try to convert to webp using local machine

        try {
          await convertToWebp(localPath, webpPath);
        } catch (err) {
          console.error(
            `An error occurred while converting the image to webp: ${err}`
          );
        }

        // Upload the webp version to the original subdirectory in the bucket
        try {
          await storage.bucket(bucketName).upload(webpPath, {
            destination: `${bucketPath ? `${bucketPath}/` : ""}${webpFileName}`,
          });
          console.log(`WebP version for ${file.name} is created and uploaded.`);
        } catch (err) {
          console.error(
            `An error occurred while uploading the webp version to the bucket: ${err}`
          );
        }
      }
    } else {
      console.log(`WebP version for ${file.name} already exists.`);
    }
  }
}

checkWebpVersion(bucketName, localDirectory).catch(console.error);
