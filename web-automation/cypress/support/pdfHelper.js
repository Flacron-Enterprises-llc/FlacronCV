/*
export const buildPdfFileName = (email, projectName, date) => {
  const formattedEmail = email;
  return `${formattedEmail}_${projectName}_${date}_FlacronBuild.pdf`;
};
*/

export const buildPdfFileName = (rawEmail, sanitizedProjectName, date) => {
  if (!rawEmail) {
    throw new Error("PDF Filename Error: rawEmail is null.");
  }

  // 1. Sanitize the email (@ and . become _)
  const sanitizedEmail = rawEmail.replace(/[@.]/g, '_');
  
  // 2. Build the name based on the ACTUAL pattern found:
  // Pattern: {email}_{projectName}_{date}_FlacronBuild.pdf
  return `${sanitizedEmail}_${sanitizedProjectName}_${date}_FlacronBuild.pdf`;
};
