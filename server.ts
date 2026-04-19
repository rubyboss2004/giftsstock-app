import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/callback"
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Google OAuth Routes
  app.get("/api/auth/google", (req, res) => {
    // Dynamically set redirect URI if not explicitly set in env
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;
    
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/spreadsheets"],
      prompt: "consent",
    });

    if (req.query.json === 'true') {
      return res.json({ url });
    }
    res.redirect(url);
  });

  app.get("/api/auth/callback", async (req, res) => {
    const { code } = req.query;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    try {
      const { tokens } = await client.getToken(code as string);
      // Store tokens in a secure cookie
      res.cookie("google_tokens", JSON.stringify(tokens), {
        httpOnly: true,
        secure: true, // Always secure for SameSite=None
        sameSite: "none", // Required for cross-origin iframe / Safari
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      
      // Use postMessage for popup flow compatibility
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/?auth=success';
              }
            </script>
            <p>驗證成功，正在關閉視窗...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error getting tokens:", error);
      res.redirect("/?auth=error");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    const tokens = req.cookies.google_tokens;
    res.json({ isAuthenticated: !!tokens });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("google_tokens");
    res.json({ success: true });
  });

  // Google Sheets Update API
  app.post("/api/sheets/update", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const tokens = JSON.parse(tokensStr);
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.get('host');
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;

      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      client.setCredentials(tokens);

      const sheets = google.sheets({ version: "v4", auth: client });
      
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values,
        },
      });

      res.json({ success: true, data: response.data });
    } catch (error: any) {
      console.error("Error updating sheet:", error);
      if (error.code === 401) {
        res.clearCookie("google_tokens");
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Helper to sync exchange to Google Sheets
  app.post("/api/sheets/sync", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const { spreadsheetId, sheetName, itemId, quantity, handler, date, system } = req.body;
    
    try {
      const tokens = JSON.parse(tokensStr);
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.get('host');
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;

      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      client.setCredentials(tokens);
      const sheets = google.sheets({ version: "v4", auth: client });

      // 1. Update the main inventory sheet (Exchange column)
      const range = `${sheetName}!A1:Z1000`; // Wider range for searching
      const getResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = getResponse.data.values;
      if (rows && rows.length > 0) {
        const header = rows[0];
        // More flexible header matching
        const nameIndex = header.findIndex(h => {
          const s = h.toLowerCase();
          return s.includes("品項") || s.includes("品名") || s.includes("名稱") || s.includes("item") || s.includes("name");
        });
        const exchangeIndex = header.findIndex(h => {
          const s = h.toLowerCase();
          return s.includes("兌換") || s.includes("已領") || s.includes("exchange") || s.includes("redeemed") || s.includes("used");
        });

        console.log(`Syncing: Found nameIndex=${nameIndex}, exchangeIndex=${exchangeIndex} in sheet ${sheetName}`);

        if (nameIndex !== -1 && exchangeIndex !== -1) {
          let rowIndex = -1;
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][nameIndex] === itemId) {
              rowIndex = i + 1;
              break;
            }
          }

          if (rowIndex !== -1) {
            const currentExchange = parseInt(rows[rowIndex - 1][exchangeIndex]) || 0;
            const newExchange = currentExchange + quantity;
            
            // Convert index to column letter (A, B, C...)
            const getColumnLetter = (index: number) => {
              let letter = "";
              while (index >= 0) {
                letter = String.fromCharCode((index % 26) + 65) + letter;
                index = Math.floor(index / 26) - 1;
              }
              return letter;
            };
            
            const columnLetter = getColumnLetter(exchangeIndex);
            const updateRange = `${sheetName}!${columnLetter}${rowIndex}`;
            
            console.log(`Updating inventory: ${updateRange} = ${newExchange}`);
            
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: updateRange,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[newExchange]],
              },
            });
          } else {
            console.warn(`Item "${itemId}" not found in sheet "${sheetName}"`);
          }
        } else {
          console.error(`Required columns not found in sheet "${sheetName}". Header: ${header.join(", ")}`);
        }
      }

      // 2. Append to "兌換紀錄" sheet
      const logSheetName = "兌換紀錄";
      try {
        // Check if sheet exists, if not create it
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === logSheetName);
        
        if (!sheetExists) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                addSheet: {
                  properties: { title: logSheetName }
                }
              }]
            }
          });
          // Add header
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${logSheetName}!A1:F1`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [["日期", "經手人", "品項", "數量", "系統", "同步時間"]]
            }
          });
        }

        // Append row
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${logSheetName}!A:F`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[date, handler, itemId, quantity, system === 'birthday' ? '生日禮物' : '換點數', new Date().toLocaleString()]]
          }
        });
      } catch (logError) {
        console.error("Error updating log sheet:", logError);
        // Don't fail the whole request if log fails
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error syncing with sheet:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
