# Render Deployment Guide

> **STALE — do not follow.** This file describes a Render.com Blueprint path that
> is not how FlacronCV is deployed. Production is AWS (Amplify + ECS); see
> `DEPLOYMENT_AND_OPS.md` and `PROJECT_PROGRESS.md` §2A. The Stripe webhook URL
> below (`/api/v1/payments/webhook` on a Render hostname) is the **wrong
> path** on a **dead host**. The live listen/webhook path is
> `/api/v1/webhooks/stripe`. Left in place so git history stays intact; do not
> treat any URL or env list here as current.

This guide will help you deploy both the **Backend API** and **Frontend Web App** to Render.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Your code should be pushed to GitHub
3. **Environment Variables**: Have all your API keys and secrets ready

---

## Deployment Options

You have two options to deploy to Render:

### Option 1: Blueprint Deployment (Recommended - One Click)

This method uses the `render.yaml` file to deploy both services automatically.

1. **Push your code to GitHub** (already done)
2. **Go to Render Dashboard**: https://dashboard.render.com
3. **Click "New" → "Blueprint"**
4. **Connect your GitHub repository**: `devkashaniqbal/FlacronCV`
5. **Render will automatically detect `render.yaml`** and create both services
6. **Set environment variables** (see section below)
7. **Click "Apply"** to start deployment

### Option 2: Manual Deployment (Two Separate Services)

Create each service manually:

#### Deploy Backend API

1. Go to Render Dashboard
2. Click **"New +" → "Web Service"**
3. Connect your GitHub repo: `devkashaniqbal/FlacronCV`
4. Configure:
   - **Name**: `flacroncv-api`
   - **Region**: Oregon (or your preferred region)
   - **Branch**: `main`
   - **Root Directory**: Leave empty (monorepo root)
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     npm install -g pnpm@8.15.0 && pnpm install && pnpm build:api
     ```
   - **Start Command**:
     ```bash
     node apps/api/dist/main.js
     ```
   - **Plan**: Starter (or your preferred plan)
5. Add environment variables (see API Environment Variables section below)
6. Click **"Create Web Service"**

#### Deploy Frontend Web App

1. Click **"New +" → "Web Service"**
2. Connect your GitHub repo again
3. Configure:
   - **Name**: `flacroncv-web`
   - **Region**: Oregon (same as API)
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     npm install -g pnpm@8.15.0 && pnpm install && pnpm build:web
     ```
   - **Start Command**:
     ```bash
     pnpm start:web
     ```
   - **Plan**: Starter
4. Add environment variables (see Web Environment Variables section below)
5. Click **"Create Web Service"**

---

## Environment Variables

### API Service Environment Variables

Go to your `flacroncv-api` service → **Environment** tab and add:

```env
# Server
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://flacroncv-web.onrender.com

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# IBM WatsonX
WATSONX_API_KEY=your-watsonx-api-key
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_PROJECT_ID=your-watsonx-project-id

# Stripe
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
STRIPE_PRO_MONTHLY_PRICE_ID=price_1T1LzDAWDS7HwRCx1DxhqRq1
STRIPE_PRO_YEARLY_PRICE_ID=price_1T1M3YAWDS7HwRCx11Tl15x4
STRIPE_ENTERPRISE_MONTHLY_PRICE_ID=price_1T1LziAWDS7HwRCxozxuJtnx
STRIPE_ENTERPRISE_YEARLY_PRICE_ID=price_1T1M49AWDS7HwRCxFxY8ZR5y
```

**Important Notes:**
- Replace all `your-*` placeholders with your actual values
- For `FIREBASE_PRIVATE_KEY`: Make sure to keep the `\n` characters for line breaks
- Get Firebase credentials from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
- Get Stripe Price IDs from your Stripe Dashboard → Products

### Web Service Environment Variables

Go to your `flacroncv-web` service → **Environment** tab and add:

```env
# Server
NODE_ENV=production

# API URL (use your actual API service URL)
NEXT_PUBLIC_API_URL=https://flacroncv-api.onrender.com/api/v1

# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

**Important Notes:**
- Replace `NEXT_PUBLIC_API_URL` with your actual API service URL from Render
- Get Firebase Client config from: Firebase Console → Project Settings → General → Your apps → Web app

---

## Deployment Order

**Important**: Deploy in this order to avoid errors:

1. **Deploy API first** → Wait for it to finish building and get the URL
2. **Update Web service's `NEXT_PUBLIC_API_URL`** with the API URL
3. **Update API service's `FRONTEND_URL`** with the Web URL (if needed for CORS)
4. **Deploy Web service**

---

## Post-Deployment Configuration

### 1. Update Stripe Webhook

After API is deployed:

1. Go to **Stripe Dashboard** → Developers → Webhooks
2. Add endpoint: `https://flacroncv-api.onrender.com/api/v1/payments/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Webhook Signing Secret**
5. Update `STRIPE_WEBHOOK_SECRET` in Render API environment variables

### 2. Configure Firebase Authentication

1. Go to **Firebase Console** → Authentication → Settings
2. Under **Authorized domains**, add:
   - `flacroncv-web.onrender.com`
   - `flacroncv-api.onrender.com`

### 3. Update CORS (if needed)

If you face CORS issues, update the API's CORS configuration to allow requests from your frontend URL.

---

## Monitoring Deployment

### Watch Build Logs

- Go to your service → **Logs** tab
- Watch for errors during build and deployment
- Common issues:
  - Missing environment variables
  - Build failures (usually missing dependencies)
  - Port conflicts

### Check Service Health

After deployment:
1. **API**: Visit `https://flacroncv-api.onrender.com/api/v1/health` (if health endpoint exists)
2. **Web**: Visit `https://flacroncv-web.onrender.com`

---

## Troubleshooting

### Build Fails with "pnpm: command not found"

**Solution**: Ensure your build command includes:
```bash
npm install -g pnpm@8.15.0
```

### Build Fails with "EROFS: read-only file system" (corepack error)

**Solution**: Use `npm install -g pnpm@8.15.0` instead of corepack, as Render's build environment has a read-only `/usr/bin` directory.

### Build Fails with "Cannot find module"

**Solution**:
- Check that `pnpm install` runs before build
- Verify all dependencies are in `package.json`
- Check that `shared-types` package is built (turbo should handle this)

### API Returns 500 Errors

**Solution**:
- Check environment variables are set correctly
- Verify Firebase credentials are valid
- Check API logs for detailed error messages

### Frontend Shows "API Error"

**Solution**:
- Verify `NEXT_PUBLIC_API_URL` points to correct API URL
- Check CORS settings on API
- Ensure API is running and healthy

### Stripe Checkout Fails

**Solution**:
- Verify all Stripe environment variables are set
- Check webhook is configured correctly
- Ensure `FRONTEND_URL` is set on API for redirect URLs

---

## Updating Your Deployment

To update your deployed services:

1. **Push code to GitHub**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

2. **Render auto-deploys** when you push to the main branch
3. Watch the **Logs** tab for deployment progress

---

## Cost Optimization

**Free Tier Limits**:
- Render offers **750 hours/month free** for web services
- Services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds

**To keep services always on**:
- Upgrade to **Starter plan** ($7/month per service)
- Or use a **cron job** to ping your API every 10 minutes

---

## Production Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] Firebase Auth configured with correct domains
- [ ] Stripe webhook configured and tested
- [ ] API and Web services both deployed and running
- [ ] Test user registration and login
- [ ] Test CV/Cover Letter creation
- [ ] Test AI generation features
- [ ] Test Stripe checkout and subscription
- [ ] Monitor logs for errors
- [ ] Set up custom domain (optional)

---

## Custom Domain (Optional)

To use your own domain:

1. **For Web service**:
   - Go to Settings → Custom Domain
   - Add your domain (e.g., `app.yourdomain.com`)
   - Update DNS records as instructed

2. **For API service**:
   - Go to Settings → Custom Domain
   - Add your API domain (e.g., `api.yourdomain.com`)
   - Update `NEXT_PUBLIC_API_URL` in Web service

---

## Support

If you encounter issues:

1. Check **Render Logs** for detailed error messages
2. Review [Render Documentation](https://render.com/docs)
3. Check [Render Community](https://community.render.com)

---

## Summary

✅ **Files Updated**:
- `render.yaml` - Blueprint configuration for auto-deployment
- `package.json` - Added build:api, build:web, start:api, start:web scripts
- `.gitignore` - Already excludes sensitive files

✅ **Deployment URL Structure**:
- API: `https://flacroncv-api.onrender.com/api/v1`
- Web: `https://flacroncv-web.onrender.com`

✅ **Next Steps**:
1. Use Blueprint deployment or manual deployment method
2. Set all environment variables
3. Configure Stripe webhook
4. Test the application

Good luck with your deployment! 🚀
