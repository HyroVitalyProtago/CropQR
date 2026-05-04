# CropQR

<img width="500" height="375" alt="FEC48250-D157-44AD-83BB-EE568A69926B" src="https://github.com/user-attachments/assets/31a89eff-b133-4d69-93c7-866ceab058ae" />

This project reuse the Crop Spectacles Sample, but instead of sending data to AI, it detects QR Code locally using jsQR.

Detection of QR Code is far from perfect, because it use Camera feed with lower resolution, so codes should be big enough to be detected. Also, if you're displaying it on a screen, you'll probably need to update the luminosity of it, or display the QR code with lower contrast for example.

Instead of doing two pinch gesture, you only use your right hand with the following pose shown in the image.
