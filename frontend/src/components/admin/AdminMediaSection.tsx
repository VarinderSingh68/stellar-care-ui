import { ChangeEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminMediaItem, getMediaItems, resolveMediaUrl, setMediaItems, uploadMediaFile } from "@/lib/admin";
import { mutedTextClass, nativeSelectClass, panelClass } from "./adminFormatters";

const defaultMediaState = {
  title: "",
  url: "",
  type: "image" as "image" | "video",
};

const AdminMediaSection = () => {
  const queryClient = useQueryClient();
  const { data: mediaItems = [] } = useQuery<AdminMediaItem[]>({
    queryKey: ["media"],
    queryFn: getMediaItems,
  });
  const [newMedia, setNewMedia] = useState(defaultMediaState);
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const saveMediaMutation = useMutation({
    mutationFn: (updated: AdminMediaItem[]) => setMediaItems(updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      queryClient.invalidateQueries({ queryKey: ["publicMedia"] });
    },
  });

  const createMedia = async () => {
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

    try {
      await saveMediaMutation.mutateAsync([mediaItem, ...mediaItems]);
      setNewMedia(defaultMediaState);
      setMessage("Media item published. It's now visible to every visitor on the testimonials page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to publish media item.");
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage("Uploading...");
    try {
      const { url } = await uploadMediaFile(file);
      setNewMedia((prev) => ({ ...prev, url }));
      setMessage("File uploaded. Click 'Publish media' to make it visible on the testimonials page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const deleteMedia = async (mediaId: string) => {
    try {
      await saveMediaMutation.mutateAsync(mediaItems.filter((item) => item.id !== mediaId));
      setMessage("Media item deleted and removed from the testimonials page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete media item.");
    }
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
            <p className={mutedTextClass}>Upload images or videos from your computer or provide a URL. They will show on the review page for every visitor.</p>
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
                disabled={isUploading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p className="mt-1 text-xs text-muted-foreground">Up to 15MB. For larger videos, host them elsewhere and paste the URL below instead.</p>
            </div>
            <div>
              <Label htmlFor="media-url">Or paste image/video URL</Label>
              <Input id="media-url" value={newMedia.url} onChange={(event) => setNewMedia({ ...newMedia, url: event.target.value })} placeholder="https://example.com/path/to/file.jpg" />
            </div>
            <Button onClick={createMedia} className="gap-2" disabled={saveMediaMutation.isPending || isUploading}>
              <ImagePlus className="h-4 w-4" />
              Publish media
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Published review media</CardTitle>
            <p className={mutedTextClass}>Media added here is publicly visible to everyone on the testimonials/review page.</p>
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
                        <a href={resolveMediaUrl(item.url)} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                          Open media URL
                        </a>
                      </div>
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => deleteMedia(item.id)} disabled={saveMediaMutation.isPending}>
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
