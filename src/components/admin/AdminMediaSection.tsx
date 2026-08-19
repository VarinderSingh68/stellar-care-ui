import { ChangeEvent, useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminMediaItem, getMediaItems, setMediaItems } from "@/lib/admin";
import { mutedTextClass, nativeSelectClass, panelClass } from "./adminFormatters";

const defaultMediaState = {
  title: "",
  url: "",
  type: "image" as "image" | "video",
};

const AdminMediaSection = () => {
  const [mediaItems, setMediaState] = useState<AdminMediaItem[]>([]);
  const [newMedia, setNewMedia] = useState(defaultMediaState);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMediaState(getMediaItems());
  }, []);

  const saveMedia = (updated: AdminMediaItem[]) => {
    setMediaItems(updated);
    setMediaState(updated);
  };

  const createMedia = () => {
    const trimmedTitle = newMedia.title.trim();
    const trimmedUrl = newMedia.url.trim();
    if (!trimmedTitle || !trimmedUrl) {
      setMessage("Please add a title and URL for the media item.");
      return;
    }

    const mediaItem: AdminMediaItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedTitle,
      url: trimmedUrl,
      type: newMedia.type,
    };

    saveMedia([mediaItem, ...mediaItems]);
    setNewMedia(defaultMediaState);
    setMessage("Media item saved. It will appear on the review page.");
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setNewMedia((prev) => ({ ...prev, url: dataUrl }));
      setMessage("Image/video loaded. Click 'Publish media' to save it.");
    };
    reader.readAsDataURL(file);
  };

  const deleteMedia = (mediaId: string) => {
    saveMedia(mediaItems.filter((item) => item.id !== mediaId));
    setMessage("Media item deleted and removed from the testimonials page.");
  };

  return (
    <div className="space-y-6">
      {message && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5 text-primary" />
              Publish review media
            </CardTitle>
            <p className={mutedTextClass}>Add images or videos from your computer or provide a URL. They will show on the review page.</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label htmlFor="media-title">Title</Label>
              <Input id="media-title" value={newMedia.title} onChange={(event) => setNewMedia({ ...newMedia, title: event.target.value })} placeholder="e.g. Smile makeover before and after" />
            </div>
            <div>
              <Label htmlFor="media-type">Type</Label>
              <select id="media-type" value={newMedia.type} onChange={(event) => setNewMedia({ ...newMedia, type: event.target.value as "image" | "video" })} className={nativeSelectClass}>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <Label htmlFor="media-file">Upload from computer</Label>
              <input
                id="media-file"
                type="file"
                accept={newMedia.type === "image" ? "image/*" : "video/*"}
                onChange={handleFileUpload}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            <div>
              <Label htmlFor="media-url">Or paste image/video URL</Label>
              <Input id="media-url" value={newMedia.url} onChange={(event) => setNewMedia({ ...newMedia, url: event.target.value })} placeholder="https://example.com/path/to/file.jpg" />
            </div>
            <Button onClick={createMedia} className="gap-2">
              <ImagePlus className="h-4 w-4" />
              Publish media
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Published review media</CardTitle>
            <p className={mutedTextClass}>Media added here will appear on the testimonials/review page.</p>
          </CardHeader>
          <CardContent>
            {mediaItems.length === 0 ? (
              <p className={mutedTextClass}>No media items added yet.</p>
            ) : (
              <div className="grid gap-4">
                {mediaItems.map((item) => (
                  <div key={item.id} className={panelClass}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <p className={mutedTextClass}>Type: {item.type}</p>
                        <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                          Open media URL
                        </a>
                      </div>
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => deleteMedia(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminMediaSection;
