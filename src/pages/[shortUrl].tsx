"use server";
import dbConnect from "@/lib/utils/db";
import Url from "@models/url";
import axios from "axios";
import { GetServerSidePropsContext } from "next";

const getCountryByIp = async (ip: string) => {
  console.log("IP: ", ip);
  try {
    const response = await axios.get(
      `http://ip-api.com/json/${ip}?fields=status,country`
    );
    if (response.data.status === "success") {
      console.log("Country:", response.data.country);
      return response.data.country || "Unknown";
    } else {
      console.error("Error fetching country:", response.data.message);
      return "Unknown";
    }
  } catch (error) {
    console.error("Error fetching country:", error);
    return "Unknown";
  }
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  if (!context.params) {
    return {
      notFound: true,
    };
  }
  if (typeof context.params.shortUrl !== "string") {
    return {
      notFound: true,
    };
  }
  const { shortUrl } = context.params;
  const { req } = context;
  await dbConnect(context.req, context.res);

  try {
    // Query
    const urlDocument = await Url.findOne({ shortenUrl: shortUrl });
    if (urlDocument) {
      if (urlDocument.isActive == false) {
        console.log("URL is not active");
        return {
          notFound: true,
          // redirect: {
          //   destination: '/waiting',
          //   permanent: false,
          // }
        };
      }

      const forwarded = req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"];
      console.log("Forwarded IP:", forwarded);
      // let clientIp = forwarded ? String(forwarded.split(',')[0].trim()) : req.socket.remoteAddress;
      let clientIp = "";
      if (typeof forwarded === "string") {
        clientIp = String(forwarded.split(",")[0].trim());
      } else if (Array.isArray(forwarded)) {
        clientIp = String(forwarded[0]?.trim());
      } else {
        clientIp = req.socket.remoteAddress || "";
      }

      if (clientIp.startsWith("::ffff:")) clientIp = clientIp.slice(7);
      const currentTime = new Date();
      const userAgent = req.headers["user-agent"] || "Unknown";
      const referrer = req.headers["referer"] || "Direct";
      // @ts-ignore
      const country = (await getCountryByIp(clientIp)) || req.headers["x-vercel-ip-country"] || "Unknown";
      await Url.updateOne(
        { shortenUrl: shortUrl },
        {
          $inc: { "accesses.count": 1 },
          $push: {
            "accesses.lastAccessed": {
              $each: [
                {
                  date: currentTime,
                  userAgent: userAgent,
                  referrer: referrer,
                  country: country,
                },
              ],
              // $slice: -10000,
            },
          },
        },
        { upsert: true }
      );

      let originalUrl = urlDocument.originalUrl;
      if (!/^https?:\/\//i.test(originalUrl)) {
        originalUrl = `https://${originalUrl}`; // Prepend https:// if missing
      }

      return {
        redirect: {
          destination: originalUrl,
          permanent: false,
        },
      };
    } else {
      // If no matching shortened URL
      return {
        notFound: true,
      };
    }
  } catch (error) {
    console.error("Error fetching the shortened:", error);
    return {
      notFound: true,
    };
  }
}

const ShortUrlRedirect = () => {
  return <p>.</p>;
};

export default ShortUrlRedirect;
