// Hand-reviewed crops of existing Brianna vault photos. These IDs are not
// access tokens; the image endpoint independently requires internal admin.
export const dashboardPortraits = [
  { key: "outdoor", id: "746b4bc1-7f59-4d3a-bb4e-c4f713a2c5b8", title: "Outdoor moments", file: "IMG_3536.jpg", crop: { left: 160, top: 260, width: 880, height: 520 } },
  { key: "portrait", id: "487f9d94-4205-439e-b7f5-74e008fdee91", title: "In the moment", file: "IMG_4596.jpg", crop: { left: 440, top: 650, width: 530, height: 440 } },
  { key: "studio", id: "f2fdc608-ba8f-4cc8-8893-0350d036b1f4", title: "Soft light", file: "IMG_3498.jpg", crop: { left: 340, top: 390, width: 340, height: 430 } },
] as const;
export const portraitUrl = (key: string) => `/api/dashboard/portrait?image=${encodeURIComponent(key)}`;
