# CropQR

<img
  width="300"
  height="300"
  alt="Screenshot 2026-05-01 at 10 35 10"
  src="https://github.com/user-attachments/assets/8c80c2bd-9730-44a4-914d-bf4149d397b9" />


This project reuse the Crop Spectacles Sample, but instead of sending data to AI, it detects QR Code using jsQR.

Detection of QR Code is far from perfect, because it use Camera feed with lower resolution, so codes should be big enough to be detected. Also, if you're displaying it on a screen, you'll probably need to update the luminosity of it, or display the QR code with lower contrast for example.

Instead of doing two pinch gesture, you only use your right hand with the following pose:
