import { checkRedditPosts } from "../jobs/checkRedditPosts";

// Test the Reddit job
checkRedditPosts()
  .then((result) => {
    console.log("Result:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
