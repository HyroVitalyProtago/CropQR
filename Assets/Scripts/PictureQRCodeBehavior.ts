import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { CropRegion } from "./CropRegion";
import { CaptionBehavior } from "./CaptionBehavior";
import { WebView } from "WebView.lspkg/WebView";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";
const jsQR = require("jsQR/jsQR.js");

@component
export class PictureQRCodeBehavior extends BaseScriptComponent {
  @input circleObjs: SceneObject[];
  @input editorCamObj: SceneObject;
  @input picAnchorObj: SceneObject;
  @input loadingObj: SceneObject;
  @input captureRendMesh: RenderMeshVisual;
  @input screenCropTexture: Texture;
  @input cropRegion: CropRegion;
  @input webview: WebView;
  @input caption: CaptionBehavior;

  private isEditor = global.deviceInfoSystem.isEditor();

  private camTrans: Transform;
  private loadingTrans: Transform;

  private circleTrans: Transform[];

  private rightHand = SIK.HandInputData.getHand("right");
  private leftHand = SIK.HandInputData.getHand("left");

  private picAnchorTrans = null;

  private rotMat = new mat3();

  private updateEvent = null;

  onAwake() {
    this.loadingObj.enabled = false;
    this.loadingTrans = this.loadingObj.getTransform();
    this.captureRendMesh.mainMaterial =
      this.captureRendMesh.mainMaterial.clone();

    this.camTrans = this.editorCamObj.getTransform();

    this.picAnchorTrans = this.picAnchorObj.getTransform();
    this.circleTrans = this.circleObjs.map((obj) => obj.getTransform());

    if (this.isEditor) {
      //place this transform in front of camera for testing
      var trans = this.getSceneObject().getTransform();
      trans.setWorldPosition(
        this.camTrans
          .getWorldPosition()
          .add(this.camTrans.forward.uniformScale(-60)),
      );
      trans.setWorldRotation(quat.lookAt(this.camTrans.forward, vec3.up()));
      //wait for small delay and capture image
      var delayedEvent = this.createEvent("DelayedCallbackEvent");
      delayedEvent.bind(() => {
        this.loadingObj.enabled = true;
        this.cropRegion.enabled = false;
        this.captureRendMesh.mainPass.captureImage =
          ProceduralTextureProvider.createFromTexture(this.screenCropTexture);
        // this.chatGPT.makeImageRequest(
        //   this.captureRendMesh.mainPass.captureImage,
        //   (response) => {
        //     this.loadingObj.enabled = false;
        //     this.loadCaption(response);
        //   }
        // );
      });
      delayedEvent.reset(0.1);
    } else {
      //send offscreen
      this.getSceneObject()
        .getTransform()
        .setWorldPosition(vec3.up().uniformScale(1000));
      this.updateEvent = this.createEvent("UpdateEvent");
      this.updateEvent.bind(this.update.bind(this));
    }
  }

  private loadCaption(text: string) {
    //position caption 5cm above top of box formed by circles
    var topCenterPos = this.circleTrans[0]
      .getWorldPosition()
      .add(this.circleTrans[1].getWorldPosition())
      .uniformScale(0.5);
    var captionPos = topCenterPos.add(this.picAnchorTrans.up.uniformScale(1)); //1.5
    var captionRot = this.picAnchorTrans.getWorldRotation();
    this.caption.openCaption(text, captionPos, captionRot);
  }

  private tryDetectQrCode() {
    const proceduralTexture = this.captureRendMesh.mainPass.captureImage;
    const procTextProvider =
      proceduralTexture.control as ProceduralTextureProvider;
    const width = proceduralTexture.getWidth();
    const height = proceduralTexture.getHeight();
    const data = new Uint8Array(width * height * 4); // TextureFormat.RGBA8Unorm => 4 for rgba
    procTextProvider.getPixels(0, 0, width, height, data);

    if (width > 150 || height > 150) {
      // console.log('too big', width, height)
      return;
    }

    // const now = Date.now();
    // TODO coroutine by batch to keep fps
    // as for now between 30-50ms
    const code = jsQR(data, width, height, {
      inversionAttempts: "dontInvert",
    });
    // console.log(Date.now() - now);

    if (code) {
      // stop update
      this.removeEvent(this.updateEvent);

      console.log("Found QR code", code);
      this.loadCaption(code.data);
      if ((code.data as string).startsWith("http")) {
        this.webview.goToUrl(code.data);
        // setTimeout(() => {
        //   this.getSceneObject().destroy();
        // }, 2500);
      } else {
        print("No URL found in QR code: " + code.data);
      }
      setTimeout(() => {
        this.updateEvent = this.createEvent("UpdateEvent");
        this.updateEvent.bind(this.update.bind(this));
      }, 2500);
    } else {
      // console.log("No QR code found...");
    }
  }

  localTopLeft() {
    return this.camTrans
      .getInvertedWorldTransform()
      .multiplyPoint(this.circleTrans[0].getWorldPosition());
  }

  localBottomRight() {
    return this.camTrans
      .getInvertedWorldTransform()
      .multiplyPoint(this.circleTrans[2].getWorldPosition());
  }

  getWidth() {
    return Math.abs(this.localBottomRight().x - this.localTopLeft().x);
  }

  getHeight() {
    return Math.abs(this.localBottomRight().y - this.localTopLeft().y);
  }

  // approximate hand up with knucle as fingers curled
  private getHandUp(hand: TrackedHand) {
    const handRightVector = hand.thumbKnuckle.position
      .sub(hand.wrist.position)
      .normalize();
    const handForwardVector = hand.middleKnuckle.position
      .sub(hand.wrist.position)
      .normalize();
    return handRightVector.cross(handForwardVector);
  }

  private getFacingCameraAngle(hand: TrackedHand): number | null {
    if (!hand.isTracked()) {
      return null;
    }

    /**
     * Apply the camera to wrist direction against the derived up vector to get facing angle
     */
    const handToCameraVector = this.camTrans
      .getWorldPosition()
      .sub(hand.wrist.position)
      .normalize();
    const dotHandCamera = this.getHandUp(hand).dot(handToCameraVector);

    const angle =
      MathUtils.RadToDeg *
      Math.acos(hand.handType === "right" ? dotHandCamera : -dotHandCamera);

    return angle;
  }

  update() {
    // check angle between thumb and index
    const thumbDir = this.rightHand.thumbTip.position
      .sub(this.rightHand.thumbKnuckle.position)
      .normalize();
    const indexDir = this.rightHand.indexTip.position
      .sub(this.rightHand.indexKnuckle.position)
      .normalize();
    const angle = thumbDir.angleTo(indexDir);
    if (angle < Math.PI * 0.3 || angle > Math.PI * 0.5) {
      return;
    }

    // check thumb and index extended

    // check middle finger curled
    const isMiddleFingerCurled =
      this.rightHand.middleTip.position.distance(
        this.rightHand.getPalmCenter(),
      ) < 10;
    if (!isMiddleFingerCurled) {
      print("middle finger not curled");
      return;
    }

    // check hand palm towards world
    const facingCameraAngle = this.getFacingCameraAngle(this.rightHand);
    if (facingCameraAngle < 90) {
      print("right hand not toward world, abort");
      return;
    }

    //have to do this or else it wont show up in capture
    if (this.screenCropTexture.getColorspace() == 3) {
      this.captureRendMesh.mainPass.captureImage =
        ProceduralTextureProvider.createFromTexture(this.screenCropTexture);

      this.tryDetectQrCode();
    }

    //set top left and bottom right to both pinch positions
    // this.circleTrans[0].setWorldPosition(this.leftHand.thumbTip.position);
    // this.circleTrans[2].setWorldPosition(this.rightHand.thumbTip.position);

    // bottom right
    this.circleTrans[2].setWorldPosition(
      this.rightHand.indexKnuckle.position
        .add(this.rightHand.thumbKnuckle.position)
        .uniformScale(0.5),
    );

    // top left
    this.circleTrans[0].setWorldPosition(
      this.circleTrans[2]
        .getWorldPosition()
        .add(
          this.rightHand.indexTip.position
            .sub(this.rightHand.indexKnuckle.position)
            .uniformScale(0.5),
        )
        .add(
          this.rightHand.thumbTip.position.sub(
            this.rightHand.thumbKnuckle.position,
          ),
        ),
    );

    var topLeftPos = this.circleTrans[0].getWorldPosition();
    var bottomRightPos = this.circleTrans[2].getWorldPosition();
    var centerPos = topLeftPos.add(bottomRightPos).uniformScale(0.5);
    var camPos = this.camTrans.getWorldPosition();
    var directionToCenter = camPos.sub(centerPos).normalize();
    var right = this.camTrans.up.cross(directionToCenter).normalize();

    //set top right and bottom left to remaining points to form a rectangle relative to worldCameraForward
    var width = this.getWidth();
    var topRightPos = topLeftPos.add(right.uniformScale(width)); // Add width along the X-axis
    var bottomLeftPos = bottomRightPos.add(right.uniformScale(-width)); // Subtract height along the Y-axis

    // Set the positions for the remaining corners
    this.circleTrans[1].setWorldPosition(topRightPos); // Top right
    this.circleTrans[3].setWorldPosition(bottomLeftPos); // Bottom left

    // rotate the picAnchorTrans to stay aligned with the box formed by the circles
    this.picAnchorTrans.setWorldPosition(bottomRightPos);
    var worldWidth = bottomRightPos.distance(bottomLeftPos);
    var worldHeight = topRightPos.distance(bottomRightPos);
    this.picAnchorTrans.setWorldScale(new vec3(worldWidth, worldHeight, 1));
    var rectRight = topRightPos.sub(topLeftPos).normalize();
    var rectUp = topLeftPos.sub(bottomLeftPos).normalize();
    var rectForward = rectRight.cross(rectUp).normalize();
    this.rotMat.column0 = rectRight;
    this.rotMat.column1 = rectUp;
    this.rotMat.column2 = rectForward;
    var rectRotation = quat.fromRotationMat(this.rotMat);
    this.picAnchorTrans.setWorldRotation(rectRotation);

    //set loader position to center of rectangle
    this.loadingTrans.setWorldPosition(
      centerPos.add(rectForward.uniformScale(0.2)),
    );
    this.loadingTrans.setWorldRotation(rectRotation);
  }
}
